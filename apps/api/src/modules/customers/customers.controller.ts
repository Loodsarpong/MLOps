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
import { CustomersService } from './customers.service';

const SegmentSchema = z.enum(['retail', 'wholesale', 'distributor', 'online']);

const CreateCustomerSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  segment: SegmentSchema.optional(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  billing_address: z.record(z.unknown()).nullish(),
  shipping_address: z.record(z.unknown()).nullish(),
  tax_id: z.string().nullish(),
  credit_limit: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
});

const UpdateCustomerSchema = CreateCustomerSchema.partial().extend({
  is_active: z.boolean().optional(),
});

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  @Roles('admin', 'sales_rep', 'cashier', 'accountant', 'viewer')
  list(
    @Query('q') q?: string,
    @Query('segment') segment?: 'retail' | 'wholesale' | 'distributor' | 'online',
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.svc.list({
      q,
      segment,
      include_inactive: includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Get(':id')
  @Roles('admin', 'sales_rep', 'cashier', 'accountant', 'viewer')
  get(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('admin', 'sales_rep')
  create(@Body() body: unknown) {
    return this.svc.create(CreateCustomerSchema.parse(body));
  }

  @Patch(':id')
  @Roles('admin', 'sales_rep')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(id, UpdateCustomerSchema.parse(body));
  }

  @Delete(':id')
  @Roles('admin')
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }
}
