import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class InvoicingService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    private readonly audit: AuditService,
  ) {}

  async list(params: { status?: string; customerId?: string; page: number; limit: number }) {
    const t = currentTenant();
    let q = this.db
      .selectFrom('invoices')
      .selectAll()
      .where('tenant_id', '=', t.tenantId);
    if (params.status) q = q.where('status', '=', params.status as never);
    if (params.customerId) q = q.where('customer_id', '=', params.customerId);

    const offset = (params.page - 1) * params.limit;
    const [rows, { total }] = await Promise.all([
      q.orderBy('issue_date', 'desc').limit(params.limit).offset(offset).execute(),
      this.db
        .selectFrom('invoices')
        .select(sql<number>`count(*)::int`.as('total'))
        .where('tenant_id', '=', t.tenantId)
        .executeTakeFirstOrThrow(),
    ]);
    return { data: rows, meta: { total, page: params.page, limit: params.limit } };
  }

  async get(id: string) {
    const t = currentTenant();
    const row = await this.db
      .selectFrom('invoices')
      .selectAll()
      .where('tenant_id', '=', t.tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException();
    return row;
  }

  async recordPayment(invoiceId: string, body: { amount: number; method: string; reference?: string }) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      await sql`SET LOCAL app.tenant_id = ${t.tenantId}`.execute(trx);
      const inv = await trx
        .selectFrom('invoices')
        .selectAll()
        .where('tenant_id', '=', t.tenantId)
        .where('id', '=', invoiceId)
        .forUpdate()
        .executeTakeFirst();
      if (!inv) throw new NotFoundException();

      const newPaid = Number(inv.amount_paid) + body.amount;
      const newBalance = Number(inv.total) - newPaid;
      const status = newBalance <= 0 ? 'paid' : 'partial';

      const payment = await trx
        .insertInto('payments')
        .values({
          tenant_id: t.tenantId,
          invoice_id: invoiceId,
          customer_id: inv.customer_id,
          amount: body.amount.toFixed(2),
          currency: inv.currency,
          method: body.method as never,
          reference: body.reference ?? null,
          recorded_by: t.userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('invoices')
        .set({ amount_paid: newPaid.toFixed(2), balance_due: newBalance.toFixed(2), status })
        .where('id', '=', invoiceId)
        .execute();

      await trx
        .insertInto('ar_transactions')
        .values({
          tenant_id: t.tenantId,
          customer_id: inv.customer_id,
          invoice_id: invoiceId,
          payment_id: payment.id,
          txn_type: 'payment',
          amount: (-body.amount).toFixed(2),
          currency: inv.currency,
        })
        .execute();

      await this.audit.log({
        action: 'update',
        entityType: 'invoice',
        entityId: invoiceId,
        before: { status: inv.status, amount_paid: inv.amount_paid },
        after: { status, amount_paid: newPaid },
      });

      return payment;
    });
  }

  async agingReport() {
    const t = currentTenant();
    return sql<{
      customer_id: string; bucket_0_30: string; bucket_31_60: string;
      bucket_61_90: string; bucket_90_plus: string; total_due: string;
    }>`
      SELECT customer_id, bucket_0_30, bucket_31_60, bucket_61_90, bucket_90_plus, total_due
      FROM mv_ar_aging
      WHERE tenant_id = ${t.tenantId}
      ORDER BY total_due DESC
    `.execute(this.db);
  }
}
