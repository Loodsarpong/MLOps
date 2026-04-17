import { Body, Controller, Get, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Get('stock')
  @Roles('admin', 'inventory_manager', 'sales_rep', 'viewer')
  stock(
    @Query('warehouse_id') warehouseId?: string,
    @Query('product_id') productId?: string,
    @Query('expiring_within_days') expiring?: string,
  ) {
    return this.svc.stock({
      warehouseId,
      productId,
      expiringWithinDays: expiring ? parseInt(expiring, 10) : undefined,
    });
  }

  @Get('low-stock')
  @Roles('admin', 'inventory_manager')
  lowStock() {
    return this.svc.lowStock();
  }

  @Get('valuation')
  @Roles('admin', 'accountant', 'inventory_manager')
  valuation(@Query('method') method: 'fifo' | 'lifo' = 'fifo') {
    return this.svc.valuation(method);
  }

  @Post('adjustments')
  @Roles('admin', 'inventory_manager')
  adjust(@Body() body: { product_id: string; warehouse_id: string; batch_id?: string; delta: number; reason: string }) {
    return this.svc.adjust(body);
  }
}
