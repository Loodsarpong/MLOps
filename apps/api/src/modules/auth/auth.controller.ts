import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { currentTenant } from '../../common/tenancy/tenant.context';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() body: unknown) {
    const parsed = LoginSchema.parse(body);
    return this.auth.login(parsed.email, parsed.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(TenantInterceptor)
  async me() {
    const t = currentTenant();
    return this.auth.getMe(t.userId);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(TenantInterceptor)
  async changePassword(@Body() body: unknown) {
    const t = currentTenant();
    const parsed = ChangePasswordSchema.parse(body);
    await this.auth.changePassword(t.userId, parsed.current_password, parsed.new_password);
    return { ok: true };
  }
}
