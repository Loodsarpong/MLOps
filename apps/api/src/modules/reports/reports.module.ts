import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsRefreshJob } from './reports-refresh.job';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRefreshJob],
})
export class ReportsModule {}
