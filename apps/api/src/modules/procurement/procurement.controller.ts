import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { ProcurementService } from './procurement.service';

const PoLineSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_cost: z.number().min(0),
  tax_pct: z.number().min(0).max(100).optional(),
});

const CreatePoSchema = z.object({
  supplier_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  currency: z.string().length(3).optional(),
  expected_date: z.string().date().nullish(),
  items: z.array(PoLineSchema).min(1),
});

const GrnSchema = z.object({
  grn_no: z.string().max(64).optional(),
  items: z
    .array(
      z.object({
        po_item_id: z.string().uuid(),
        quantity: z.number().positive(),
        unit_cost: z.number().min(0).optional(),
        batch_id: z.string().uuid().nullish(),
      }),
    )
    .min(1),
});

@ApiTags('procurement')
@ApiBearerAuth()
@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  @Get()
  @Roles('admin', 'inventory_manager', 'accountant', 'viewer')
  list(@Query('status') status?: string, @Query('supplier_id') supplierId?: string) {
    return this.svc.list({ status, supplier_id: supplierId });
  }

  @Get(':id')
  @Roles('admin', 'inventory_manager', 'accountant', 'viewer')
  get(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('admin', 'inventory_manager')
  create(@Body() body: unknown) {
    return this.svc.create(CreatePoSchema.parse(body));
  }

  @Post(':id/approve')
  @Roles('admin', 'inventory_manager')
  approve(@Param('id') id: string) {
    return this.svc.approve(id);
  }

  @Post(':id/send')
  @Roles('admin', 'inventory_manager')
  send(@Param('id') id: string) {
    return this.svc.send(id);
  }

  @Post(':id/grn')
  @Roles('admin', 'inventory_manager')
  grn(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.receiveGrn(id, GrnSchema.parse(body));
  }
}
