import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { createHash } from 'node:crypto';
import { Kysely, sql } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../tenancy/tenant.context';

/**
 * If an Idempotency-Key header is present on a mutating request, look up a
 * prior response and replay it, otherwise record the result after success.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next.handle();

    const hash = createHash('sha256')
      .update(req.method + req.url + JSON.stringify(req.body ?? {}))
      .digest('hex');

    return from(this.loadKey(key, hash)).pipe(
      switchMap((cached) => {
        if (cached) {
          res.status(cached.response_status ?? 200);
          return of(cached.response_body);
        }
        return next.handle().pipe(
          tap(async (body) => {
            await this.saveKey(key, hash, res.statusCode, body).catch(() => void 0);
          }),
        );
      }),
    );
  }

  private async loadKey(key: string, hash: string) {
    const t = currentTenant();
    const row = await this.db
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('tenant_id', '=', t.tenantId)
      .where('key', '=', key)
      .where('expires_at', '>', sql<any>`now()`)
      .executeTakeFirst();
    if (row && row.request_hash !== hash) {
      throw new Error('Idempotency key reused with different payload');
    }
    return row ?? null;
  }

  private async saveKey(key: string, hash: string, status: number, body: unknown) {
    const t = currentTenant();
    await this.db
      .insertInto('idempotency_keys')
      .values({
        tenant_id: t.tenantId,
        key,
        request_hash: hash,
        response_status: status,
        response_body: body as never,
      })
      .onConflict((oc) => oc.columns(['tenant_id', 'key']).doNothing())
      .execute();
  }
}
