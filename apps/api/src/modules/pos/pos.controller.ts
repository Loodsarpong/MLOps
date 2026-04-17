import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { PosService } from './pos.service';
import { PosSaleSchema, PosSyncSchema } from './pos.dto';

@ApiTags('pos')
@ApiBearerAuth()
@Controller('pos')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor, IdempotencyInterceptor)
export class PosController {
  constructor(private readonly svc: PosService) {}

  @Post('sales')
  @Roles('cashier', 'sales_rep', 'admin')
  async createSale(@Body() body: unknown) {
    return this.svc.recordSale(PosSaleSchema.parse(body));
  }

  @Post('sync')
  @Roles('cashier', 'sales_rep', 'admin')
  async syncOffline(@Body() body: unknown) {
    const { sales } = PosSyncSchema.parse(body);
    const results = [];
    for (const sale of sales) {
      try {
        const r = await this.svc.recordSale(sale);
        results.push({ key: sale.client_idempotency_key, ok: true, data: r });
      } catch (e) {
        results.push({ key: sale.client_idempotency_key, ok: false, error: (e as Error).message });
      }
    }
    return { results };
  }
}
