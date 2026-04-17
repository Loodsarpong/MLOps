import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Kysely, sql } from 'kysely';
import { Database } from './db/schema';
import { KYSELY } from './db/db.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(KYSELY) private readonly db: Kysely<Database>,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => {
        await sql`SELECT 1`.execute(this.db);
        return { database: { status: 'up' } };
      },
    ]);
  }
}
