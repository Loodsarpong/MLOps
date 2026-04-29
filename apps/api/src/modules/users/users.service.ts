import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';
import { hashPassword } from '../auth/auth.service';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function generateTempPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[Math.floor(Math.random() * PASSWORD_ALPHABET.length)];
  }
  return out;
}

export interface CreateUserInput {
  email: string;
  full_name: string;
  phone?: string | null;
  role_codes: string[];
  password?: string; // optional; auto-generated if omitted
}

export interface UpdateUserInput {
  full_name?: string;
  phone?: string | null;
  is_active?: boolean;
  role_codes?: string[];
}

@Injectable()
export class UsersService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async list() {
    const t = currentTenant();
    const users = await this.db
      .selectFrom('users')
      .leftJoin('user_roles', 'user_roles.user_id', 'users.id')
      .leftJoin('roles', 'roles.id', 'user_roles.role_id')
      .select([
        'users.id',
        'users.email',
        'users.full_name',
        'users.phone',
        'users.is_active',
        'users.must_change_password',
        'users.locked_until',
        'users.last_login_at',
        'users.created_at',
        'roles.code as role_code',
      ])
      .where('users.tenant_id', '=', t.tenantId)
      .orderBy('users.created_at', 'desc')
      .execute();

    // Collapse the join into one row per user with a roles[] column.
    const byId = new Map<string, any>();
    for (const r of users) {
      const existing = byId.get(r.id);
      if (existing) {
        if (r.role_code) existing.roles.push(r.role_code);
      } else {
        byId.set(r.id, {
          id: r.id,
          email: r.email,
          full_name: r.full_name,
          phone: r.phone,
          is_active: r.is_active,
          must_change_password: r.must_change_password,
          locked_until: r.locked_until,
          last_login_at: r.last_login_at,
          created_at: r.created_at,
          roles: r.role_code ? [r.role_code] : [],
        });
      }
    }
    return Array.from(byId.values());
  }

  async create(input: CreateUserInput) {
    const t = currentTenant();
    const password = input.password ?? generateTempPassword();
    const hash = await hashPassword(password);

    const roleIds = await this.resolveRoleIds(input.role_codes);

    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('users')
        .select('id')
        .where('tenant_id', '=', t.tenantId)
        .where('email', '=', input.email)
        .executeTakeFirst();
      if (existing) throw new ConflictException(`A user with email ${input.email} already exists`);

      const user = await trx
        .insertInto('users')
        .values({
          tenant_id: t.tenantId,
          email: input.email,
          full_name: input.full_name,
          phone: input.phone ?? null,
          password_hash: hash,
          must_change_password: true,
          is_active: true,
        })
        .returning(['id', 'email', 'full_name'])
        .executeTakeFirstOrThrow();

      if (roleIds.length) {
        await trx
          .insertInto('user_roles')
          .values(roleIds.map((role_id) => ({ user_id: user.id, role_id })))
          .execute();
      }
      return { ...user, temp_password: input.password ? undefined : password };
    });
  }

  async update(userId: string, patch: UpdateUserInput) {
    const t = currentTenant();
    const updates: Record<string, unknown> = {};
    if (patch.full_name !== undefined) updates.full_name = patch.full_name;
    if (patch.phone !== undefined) updates.phone = patch.phone;
    if (patch.is_active !== undefined) updates.is_active = patch.is_active;

    return this.db.transaction().execute(async (trx) => {
      if (Object.keys(updates).length) {
        const r = await trx
          .updateTable('users')
          .set(updates)
          .where('id', '=', userId)
          .where('tenant_id', '=', t.tenantId)
          .returning(['id'])
          .executeTakeFirst();
        if (!r) throw new NotFoundException('User not found');
      }

      if (patch.role_codes !== undefined) {
        const roleIds = await this.resolveRoleIds(patch.role_codes);
        await trx.deleteFrom('user_roles').where('user_id', '=', userId).execute();
        if (roleIds.length) {
          await trx
            .insertInto('user_roles')
            .values(roleIds.map((role_id) => ({ user_id: userId, role_id })))
            .execute();
        }
      }
      return { id: userId };
    });
  }

  /**
   * Admin-driven password reset. Sets a fresh temp password and forces the
   * user to change it on next login. Returns the temp password so the admin
   * can hand it to the user out-of-band.
   */
  async resetPassword(userId: string): Promise<{ temp_password: string }> {
    const t = currentTenant();
    const tempPassword = generateTempPassword();
    const hash = await hashPassword(tempPassword);
    const r = await this.db
      .updateTable('users')
      .set({
        password_hash: hash,
        must_change_password: true,
        failed_login_count: 0,
        locked_until: null,
      })
      .where('id', '=', userId)
      .where('tenant_id', '=', t.tenantId)
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw new NotFoundException('User not found');
    return { temp_password: tempPassword };
  }

  async unlock(userId: string) {
    const t = currentTenant();
    const r = await this.db
      .updateTable('users')
      .set({ failed_login_count: 0, locked_until: null })
      .where('id', '=', userId)
      .where('tenant_id', '=', t.tenantId)
      .returning(['id'])
      .executeTakeFirst();
    if (!r) throw new NotFoundException('User not found');
    return { id: userId };
  }

  private async resolveRoleIds(roleCodes: string[]): Promise<string[]> {
    if (!roleCodes.length) return [];
    const rows = await this.db
      .selectFrom('roles')
      .select(['id', 'code'])
      .where('code', 'in', roleCodes)
      .execute();
    if (rows.length !== roleCodes.length) {
      const found = new Set(rows.map((r) => r.code));
      const missing = roleCodes.filter((c) => !found.has(c));
      throw new BadRequestException(`Unknown role(s): ${missing.join(', ')}`);
    }
    return rows.map((r) => r.id);
  }
}
