import { Body, Controller, Get, Inject, Param, Patch, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { KYSELY } from '../../db/db.module';
import { Database } from '../../db/schema';
import { currentTenant } from '../../common/tenancy/tenant.context';

const WarehouseUpdateSchema = z.object({
  clerk_name: z.string().min(1).max(120).nullish(),
  clerk_email: z.string().email().nullish(),
  clerk_phone: z.string().min(3).max(50).nullish(),
  address: z.record(z.unknown()).nullish(),
});

@ApiTags('warehouses')
@ApiBearerAuth()
@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class WarehousesController {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  @Get()
  @Roles('admin', 'inventory_manager', 'sales_rep', 'cashier', 'accountant', 'viewer')
  async list() {
    const t = currentTenant();
    return this.db
      .selectFrom('warehouses')
      .select(['id', 'code', 'name', 'type', 'clerk_name', 'clerk_email'])
      .where('tenant_id', '=', t.tenantId)
      .where('is_active', '=', true)
      .orderBy('name')
      .execute();
  }

  /**
   * Update mutable warehouse fields (clerk contact, address). Admin-only.
   * Returns the updated row so the UI can refresh without a refetch.
   */
  @Patch(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const t = currentTenant();
    const patch = WarehouseUpdateSchema.parse(body);
    const updates: Record<string, unknown> = {};
    if (patch.clerk_name !== undefined) updates.clerk_name = patch.clerk_name;
    if (patch.clerk_email !== undefined) updates.clerk_email = patch.clerk_email;
    if (patch.clerk_phone !== undefined) updates.clerk_phone = patch.clerk_phone;
    if (patch.address !== undefined) updates.address = patch.address as never;
    if (!Object.keys(updates).length) return { ok: true, changed: 0 };

    const row = await this.db
      .updateTable('warehouses')
      .set(updates)
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .returning(['id', 'code', 'name', 'type', 'address', 'clerk_name', 'clerk_email', 'clerk_phone'])
      .executeTakeFirst();
    return row ?? { ok: false, error: 'not_found' };
  }
}
