import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryImportService } from './inventory-import.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryImportService, AuditService],
  exports: [InventoryService],
})
export class InventoryModule {}
