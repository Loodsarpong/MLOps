import { Module } from '@nestjs/common';
import { DbModule } from '../../db/db.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [DbModule],
  controllers: [ProcurementController],
  providers: [ProcurementService, AuditService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
