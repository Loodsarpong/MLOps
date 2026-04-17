import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Kysely, sql } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';

@Injectable()
export class ReportsRefreshJob {
  private readonly log = new Logger(ReportsRefreshJob.name);
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  @Cron(CronExpression.EVERY_HOUR)
  async refresh() {
    try {
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_daily`.execute(this.db);
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ar_aging`.execute(this.db);
      this.log.log('materialized views refreshed');
    } catch (e) {
      this.log.error('refresh failed', e as Error);
    }
  }
}
