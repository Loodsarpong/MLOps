import { Controller, Get, Inject, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Kysely } from 'kysely';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { KYSELY } from '../../db/db.module';
import { Database } from '../../db/schema';
import { currentTenant } from '../../common/tenancy/tenant.context';

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
      .select(['id', 'code', 'name', 'type'])
      .where('tenant_id', '=', t.tenantId)
      .where('is_active', '=', true)
      .orderBy('name')
      .execute();
  }
}
