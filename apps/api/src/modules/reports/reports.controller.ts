import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles('admin', 'accountant', 'sales_rep', 'inventory_manager', 'viewer')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('sales/daily')
  salesDaily(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.salesDaily(from, to);
  }

  @Get('sales/top-products')
  top(@Query('limit') limit = '10') {
    return this.svc.topProducts(parseInt(limit, 10));
  }

  @Get('ar/aging')
  aging() {
    return this.svc.arAging();
  }

  @Get('procurement/suppliers')
  suppliers() {
    return this.svc.supplierPerformance();
  }
}
