import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [DbModule],
  controllers: [PayrollController],
  providers: [PayrollService, AuditService],
  exports: [PayrollService],
})
export class PayrollModule {}
