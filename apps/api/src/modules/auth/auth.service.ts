import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as argon2 from 'argon2';
import { Kysely } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { loadConfig } from '../../config/env';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const ARGON_OPTS = { type: argon2.argon2id } as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export interface LoginResult {
  id_token: string;
  refresh_token: string;
  must_change_password: boolean;
  user: { id: string; email: string; tenantId: string; roles: string[]; fullName: string };
}

@Injectable()
export class AuthService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const cfg = loadConfig();

    const user = await this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    // Generic error for unknown email *or* wrong password — don't leak which.
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (!user.is_active) throw new ForbiddenException('Account is disabled');

    if (user.locked_until && new Date(user.locked_until as unknown as string) > new Date()) {
      throw new UnauthorizedException(
        `Account locked due to repeated failed logins. Try again after ${new Date(user.locked_until as unknown as string).toLocaleString()}.`,
      );
    }

    if (!user.password_hash) {
      throw new UnauthorizedException(
        'Account not yet activated. Ask an administrator to set your password.',
      );
    }

    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) {
      await this.recordFailedAttempt(user.id, user.failed_login_count);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success — reset counter, stamp last_login_at.
    await this.db
      .updateTable('users')
      .set({ failed_login_count: 0, locked_until: null, last_login_at: new Date() })
      .where('id', '=', user.id)
      .execute();

    const roleRows = await this.db
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .select(['roles.code'])
      .where('user_roles.user_id', '=', user.id)
      .execute();
    const roles = roleRows.map((r) => r.code);

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        'custom:user_id': user.id,
        'custom:tenant_id': user.tenant_id,
        'custom:roles': roles.join(','),
        // Embed must_change_password so the web app can route to /change-password
        // without an extra round-trip; server-side endpoints that mutate will
        // re-check the DB anyway.
        'custom:must_change_password': user.must_change_password,
      },
      cfg.DEV_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '12h' },
    );

    return {
      id_token: token,
      refresh_token: token,
      must_change_password: user.must_change_password,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenant_id,
        roles,
        fullName: user.full_name,
      },
    };
  }

  /**
   * Self-service password change. Requires the current password to prevent
   * session-hijack escalation. Clears must_change_password.
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new UnauthorizedException('New password must be at least 8 characters');
    }

    const user = await this.db
      .selectFrom('users')
      .select(['password_hash'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Account not yet activated');
    }
    const ok = await verifyPassword(user.password_hash, oldPassword);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const newHash = await hashPassword(newPassword);
    await this.db
      .updateTable('users')
      .set({
        password_hash: newHash,
        must_change_password: false,
        failed_login_count: 0,
        locked_until: null,
      })
      .where('id', '=', userId)
      .execute();
  }

  async getMe(userId: string) {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'tenant_id', 'email', 'full_name', 'must_change_password'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) throw new UnauthorizedException('User not found');

    const roles = await this.db
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .select(['roles.code'])
      .where('user_roles.user_id', '=', userId)
      .execute();

    return {
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      fullName: user.full_name,
      mustChangePassword: user.must_change_password,
      roles: roles.map((r) => r.code),
    };
  }

  private async recordFailedAttempt(userId: string, currentCount: number): Promise<void> {
    const next = currentCount + 1;
    const update: Record<string, unknown> = { failed_login_count: next };
    if (next >= MAX_FAILED_ATTEMPTS) {
      update.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      update.failed_login_count = 0; // reset counter once locked
    }
    await this.db.updateTable('users').set(update).where('id', '=', userId).execute();
  }
}
