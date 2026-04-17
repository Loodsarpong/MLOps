import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Kysely } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { loadConfig } from '../../config/env';

// Dev-only credentials. Do NOT ship to production.
// Any seeded user in the `users` table can sign in with this password.
const DEV_PASSWORD = 'dev-password';

@Injectable()
export class AuthService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async devLogin(email: string, password: string) {
    const cfg = loadConfig();
    if (cfg.NODE_ENV === 'production') {
      throw new UnauthorizedException('Dev login disabled in production');
    }
    if (password !== DEV_PASSWORD) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
    if (!user) throw new UnauthorizedException('User not found');

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
      },
      cfg.DEV_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '12h' },
    );

    return {
      id_token: token,
      refresh_token: token,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenant_id,
        roles,
      },
    };
  }
}
