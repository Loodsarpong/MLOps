import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { TenantInterceptor } from '../../common/tenancy/tenant.interceptor';
import { UsersService } from './users.service';

const CreateUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  phone: z.string().nullish(),
  role_codes: z.array(z.string()).default([]),
  password: z.string().min(8).optional(),
});

const UpdateUserSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().nullish(),
  is_active: z.boolean().optional(),
  role_codes: z.array(z.string()).optional(),
});

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @Roles('admin')
  list() {
    return this.svc.list();
  }

  @Post()
  @Roles('admin')
  create(@Body() body: unknown) {
    const parsed = CreateUserSchema.parse(body);
    return this.svc.create(parsed);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateUserSchema.parse(body);
    return this.svc.update(id, parsed);
  }

  @Post(':id/reset-password')
  @Roles('admin')
  resetPassword(@Param('id') id: string) {
    return this.svc.resetPassword(id);
  }

  @Post(':id/unlock')
  @Roles('admin')
  unlock(@Param('id') id: string) {
    return this.svc.unlock(id);
  }
}
