import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../tenancy/tenant.context';

type AuditAction = 'create' | 'update' | 'delete' | 'approve' | 'void' | 'login' | 'export';

@Injectable()
export class AuditService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async log(params: {
    action: AuditAction;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
  }) {
    const t = currentTenant();
    await this.db
      .insertInto('audit_logs')
      .values({
        tenant_id: t.tenantId,
        actor_id: t.userId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null,
        before_state: (params.before ?? null) as never,
        after_state: (params.after ?? null) as never,
        ip_address: t.ip ?? null,
        user_agent: t.userAgent ?? null,
      })
      .execute();
  }
}
