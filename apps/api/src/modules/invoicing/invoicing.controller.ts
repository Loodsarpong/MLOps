import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { InvoicingService } from './invoicing.service';
import { CreateInvoiceSchema } from './invoicing.dto';

@ApiTags('invoicing')
@ApiBearerAuth()
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor, IdempotencyInterceptor)
export class InvoicingController {
  constructor(private readonly svc: InvoicingService) {}

  @Get()
  @Roles('admin', 'accountant', 'sales_rep')
  list(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('status') status?: string,
    @Query('customer_id') customerId?: string,
  ) {
    return this.svc.list({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 200),
      status,
      customerId,
    });
  }

  @Get(':id')
  @Roles('admin', 'accountant', 'sales_rep')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  @Roles('admin', 'accountant', 'sales_rep')
  create(@Body() body: unknown) {
    return this.svc.create(CreateInvoiceSchema.parse(body));
  }

  @Post(':id/payments')
  @Roles('admin', 'accountant', 'cashier')
  recordPayment(@Param('id') id: string, @Body() body: { amount: number; method: string; reference?: string }) {
    return this.svc.recordPayment(id, body);
  }
}
