import { Body, Controller, Get, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../../common/tenancy/tenant.interceptor';
import { QboAuthService } from './qbo-auth.service';
import { QboSyncService } from './qbo-sync.service';
import { currentTenant } from '../../../common/tenancy/tenant.context';
import { nanoid } from 'nanoid';

@ApiTags('integrations-quickbooks')
@ApiBearerAuth()
@Controller('integrations/quickbooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class QuickBooksController {
  constructor(private readonly auth: QboAuthService, private readonly sync: QboSyncService) {}

  @Get('connect')
  @Roles('admin', 'accountant')
  connect() {
    const t = currentTenant();
    return { url: this.auth.authorizeUrl(t.tenantId, nanoid(12)) };
  }

  @Post('callback')
  async callback(@Body() body: { code: string; realmId: string; state: string }) {
    const [tenantId] = body.state.split(':');
    await this.auth.exchange(tenantId, body.code, body.realmId);
    return { ok: true };
  }

  @Post('invoices/:id/sync')
  @Roles('admin', 'accountant')
  async syncInvoice(@Req() req: { params: { id: string } }) {
    const t = currentTenant();
    const qboId = await this.sync.syncInvoice(t.tenantId, req.params.id);
    return { qbo_invoice_id: qboId };
  }
}
