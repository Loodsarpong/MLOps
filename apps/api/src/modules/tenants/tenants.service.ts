import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';

export interface UpdateTenantInput {
  name?: string;
  base_currency?: string;
  timezone?: string;
  plan?: string;
  default_tax_rate_pct?: number;
}

@Injectable()
export class TenantsService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async current() {
    const t = currentTenant();
    const row = await this.db
      .selectFrom('tenants')
      .select([
        'id', 'name', 'slug', 'base_currency', 'timezone', 'plan',
        'is_active', 'default_tax_rate_pct', 'created_at', 'updated_at',
      ])
      .where('id', '=', t.tenantId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Tenant not found');
    return row;
  }

  async update(patch: UpdateTenantInput) {
    const t = currentTenant();
    const updates: Record<string, unknown> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.base_currency !== undefined) updates.base_currency = patch.base_currency;
    if (patch.timezone !== undefined) updates.timezone = patch.timezone;
    if (patch.plan !== undefined) updates.plan = patch.plan;
    if (patch.default_tax_rate_pct !== undefined) {
      updates.default_tax_rate_pct = patch.default_tax_rate_pct.toFixed(2);
    }

    if (!Object.keys(updates).length) {
      throw new BadRequestException('No fields to update');
    }

    const row = await this.db
      .updateTable('tenants')
      .set(updates)
      .where('id', '=', t.tenantId)
      .returning([
        'id', 'name', 'slug', 'base_currency', 'timezone', 'plan',
        'is_active', 'default_tax_rate_pct', 'created_at', 'updated_at',
      ])
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Tenant not found');
    return row;
  }
}
