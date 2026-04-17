import { Global, Module } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './schema';
import { loadConfig } from '../config/env';

export const KYSELY = Symbol('KYSELY');

@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      useFactory: () => {
        const cfg = loadConfig();
        const pool = new Pool({
          connectionString: cfg.DATABASE_URL,
          max: 20,
          idleTimeoutMillis: 30_000,
          application_name: 'ns-api',
        });
        return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
      },
    },
  ],
  exports: [KYSELY],
})
export class DbModule {}
