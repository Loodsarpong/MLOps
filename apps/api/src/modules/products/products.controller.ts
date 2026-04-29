import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { ProductsService } from './products.service';

const CreateProductSchema = z.object({
  sku: z.string().min(1).max(64),
  upc: z.string().nullish(),
  name: z.string().min(1).max(200),
  description: z.string().nullish(),
  category: z.string().nullish(),
  uom: z.string().min(1).max(20),
  is_tracked_by_batch: z.boolean().optional(),
  tax_rate_pct: z.number().min(0).max(100).optional(),
  cost_price: z.number().min(0).optional(),
  base_price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  weight_grams: z.number().nullish(),
});

const UpdateProductSchema = CreateProductSchema.partial().extend({
  is_active: z.boolean().optional(),
});

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  @Roles('admin', 'inventory_manager', 'sales_rep', 'cashier', 'accountant', 'viewer')
  list(
    @Query('q') q?: string,
    @Query('include_inactive') includeInactive?: string,
    @Query('category') category?: string,
  ) {
    return this.svc.list({
      q,
      include_inactive: includeInactive === 'true' || includeInactive === '1',
      category: category || undefined,
    });
  }

  @Get('categories')
  @Roles('admin', 'inventory_manager', 'sales_rep', 'cashier', 'accountant', 'viewer')
  categories() {
    return this.svc.listCategories();
  }

  @Get(':id')
  @Roles('admin', 'inventory_manager', 'sales_rep', 'cashier', 'accountant', 'viewer')
  get(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('admin', 'inventory_manager')
  create(@Body() body: unknown) {
    return this.svc.create(CreateProductSchema.parse(body));
  }

  @Patch(':id')
  @Roles('admin', 'inventory_manager')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, UpdateProductSchema.parse(body));
  }

  @Delete(':id')
  @Roles('admin', 'inventory_manager')
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }
}
