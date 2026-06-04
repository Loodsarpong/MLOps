import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { TenantsService } from './tenants.service';

const UpdateTenantSchema = z
  .object({
    name: z.string().min(1).max(200),
    base_currency: z.string().length(3),
    timezone: z.string().min(1).max(64),
    plan: z.string().min(1).max(32),
    default_tax_rate_pct: z.number().min(0).max(100),
  })
  .partial();

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class TenantsController {
  constructor(private readonly svc: TenantsService) {}

  @Get('current')
  current() {
    return this.svc.current();
  }

  @Patch('current')
  @Roles('admin')
  update(@Body() body: unknown) {
    return this.svc.update(UpdateTenantSchema.parse(body));
  }
}
