import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [PosController],
  providers: [PosService, AuditService],
})
export class PosModule {}
