import {
  Body,
  Controller,
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
import { PayrollService } from './payroll.service';

const CreateEmployeeSchema = z.object({
  code: z.string().min(1).max(64),
  full_name: z.string().min(1).max(200),
  email: z.string().email().nullish(),
  department: z.string().max(100).nullish(),
  position: z.string().max(100).nullish(),
  base_salary: z.number().min(0),
  currency: z.string().length(3).optional(),
  hired_on: z.string().date(),
  terminated_on: z.string().date().nullish(),
  bank_details: z.record(z.unknown()).nullish(),
});

const UpdateEmployeeSchema = CreateEmployeeSchema.partial();

const CreateRunSchema = z.object({
  period_start: z.string().date(),
  period_end: z.string().date(),
});

@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  // ---- Employees ----
  @Get('employees')
  @Roles('admin', 'accountant')
  listEmployees(@Query('include_terminated') includeTerminated?: string) {
    return this.svc.listEmployees(includeTerminated === 'true' || includeTerminated === '1');
  }

  @Get('employees/:id')
  @Roles('admin', 'accountant')
  getEmployee(@Param('id') id: string) {
    return this.svc.findEmployee(id);
  }

  @Post('employees')
  @Roles('admin')
  createEmployee(@Body() body: unknown) {
    return this.svc.createEmployee(CreateEmployeeSchema.parse(body));
  }

  @Patch('employees/:id')
  @Roles('admin')
  updateEmployee(@Param('id') id: string, @Body() body: unknown) {
    return this.svc.updateEmployee(id, UpdateEmployeeSchema.parse(body));
  }

  // ---- Runs ----
  @Get('runs')
  @Roles('admin', 'accountant')
  listRuns() {
    return this.svc.listRuns();
  }

  @Get('runs/:id')
  @Roles('admin', 'accountant')
  getRun(@Param('id') id: string) {
    return this.svc.findRun(id);
  }

  @Post('runs')
  @Roles('admin')
  createRun(@Body() body: unknown) {
    return this.svc.createRun(CreateRunSchema.parse(body));
  }

  @Post('runs/:id/calculate')
  @Roles('admin')
  calculate(@Param('id') id: string) {
    return this.svc.calculate(id);
  }

  @Post('runs/:id/approve')
  @Roles('admin')
  approve(@Param('id') id: string) {
    return this.svc.approve(id);
  }
}
