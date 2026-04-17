import { Module } from '@nestjs/common';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [InvoicingController],
  providers: [InvoicingService, InvoicePdfService, AuditService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
