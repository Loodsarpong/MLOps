import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { Kysely } from 'kysely';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { KYSELY } from '../../db/db.module';
import { Database } from '../../db/schema';
import { currentTenant } from '../../common/tenancy/tenant.context';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ProductsController {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  @Get()
  @Roles('admin', 'inventory_manager', 'sales_rep', 'cashier', 'accountant', 'viewer')
  async list() {
    const t = currentTenant();
    return this.db
      .selectFrom('products')
      .select(['id', 'sku', 'upc', 'name', 'category', 'uom', 'tax_rate_pct', 'base_price', 'currency'])
      .where('tenant_id', '=', t.tenantId)
      .where('is_active', '=', true)
      .orderBy('name')
      .execute();
  }
}
