import { Module } from '@nestjs/common';
import { QuickBooksController } from './quickbooks.controller';
import { QboAuthService } from './qbo-auth.service';
import { QboSyncService } from './qbo-sync.service';

@Module({
  controllers: [QuickBooksController],
  providers: [QboAuthService, QboSyncService],
  exports: [QboSyncService],
})
export class QuickBooksModule {}
