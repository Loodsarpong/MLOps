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
import { SuppliersService } from './suppliers.service';

const CreateSupplierSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  contact_name: z.string().max(200).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  address: z.record(z.unknown()).nullish(),
  payment_terms_days: z.number().int().min(0).max(365).optional(),
  currency: z.string().length(3).optional(),
  rating: z.number().min(0).max(5).nullish(),
});

const UpdateSupplierSchema = CreateSupplierSchema.partial().extend({
  is_active: z.boolean().optional(),
});

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Get()
  @Roles('admin', 'inventory_manager', 'accountant', 'viewer')
  list(
    @Query('q') q?: string,
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.svc.list({
      q,
      include_inactive: includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Get(':id')
  @Roles('admin', 'inventory_manager', 'accountant', 'viewer')
  get(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Get(':id/performance')
  @Roles('admin', 'inventory_manager', 'accountant')
  performance(@Param('id') id: string) {
    return this.svc.performance(id);
  }

  @Post()
  @Roles('admin', 'inventory_manager')
  create(@Body() body: unknown) {
    return this.svc.create(CreateSupplierSchema.parse(body));
  }

  @Patch(':id')
  @Roles('admin', 'inventory_manager')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, UpdateSupplierSchema.parse(body));
  }

  @Delete(':id')
  @Roles('admin')
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }
}
