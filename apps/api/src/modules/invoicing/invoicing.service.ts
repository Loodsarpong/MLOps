import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { nanoid } from 'nanoid';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';
import { AuditService } from '../../common/audit/audit.service';
import { CreateInvoiceDto, InvoiceLineInput, isFromOrder } from './invoicing.dto';

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

  // ------------------------------------------------------------------
  // Create — POST /invoices
  // Two paths: { order_id } reuses a confirmed sales_order's lines;
  //            { customer_id, lines } is manual entry.
  // Both run in one transaction with the tenant context set so RLS holds.
  // ------------------------------------------------------------------
  async create(dto: CreateInvoiceDto) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', ${t.tenantId}, true)`.execute(trx);

      const today = new Date().toISOString().slice(0, 10);

      let customerId: string;
      let currency: string;
      let orderId: string | null = null;
      let lines: Array<InvoiceLineInput & { line_total: number }>;

      if (isFromOrder(dto)) {
        const order = await trx
          .selectFrom('sales_orders')
          .selectAll()
          .where('tenant_id', '=', t.tenantId)
          .where('id', '=', dto.order_id)
          .executeTakeFirst();
        if (!order) throw new NotFoundException(`sales_order ${dto.order_id} not found`);
        if (!order.customer_id) {
          throw new BadRequestException('cannot invoice a sales_order without a customer');
        }
        if (order.status === 'cancelled' || order.status === 'returned') {
          throw new BadRequestException(`cannot invoice a ${order.status} order`);
        }
        // Refuse to issue twice for the same order.
        const existing = await trx
          .selectFrom('invoices')
          .select('id')
          .where('tenant_id', '=', t.tenantId)
          .where('order_id', '=', order.id)
          .where('status', '!=', 'void')
          .executeTakeFirst();
        if (existing) {
          throw new BadRequestException(`order ${order.order_no} is already invoiced`);
        }

        const orderItems = await trx
          .selectFrom('sales_order_items as soi')
          .leftJoin('products as p', 'p.id', 'soi.product_id')
          .select([
            'soi.product_id',
            'soi.quantity',
            'soi.unit_price',
            'soi.tax_pct',
            'soi.line_total',
            'p.name as product_name',
          ])
          .where('soi.order_id', '=', order.id)
          .execute();

        if (orderItems.length === 0) {
          throw new BadRequestException(`order ${order.order_no} has no line items`);
        }

        customerId = order.customer_id;
        currency = order.currency;
        orderId = order.id;
        // Snapshot the order's prices/taxes so a later product price change
        // does not silently change the customer's bill.
        lines = orderItems.map((oi) => ({
          product_id: oi.product_id,
          description: oi.product_name ?? 'Item',
          quantity: Number(oi.quantity),
          unit_price: Number(oi.unit_price),
          tax_pct: Number(oi.tax_pct),
          line_total: Number(oi.line_total),
        }));
      } else {
        // Manual entry — confirm the customer belongs to this tenant.
        const customer = await trx
          .selectFrom('customers')
          .select(['id', 'currency'])
          .where('tenant_id', '=', t.tenantId)
          .where('id', '=', dto.customer_id)
          .executeTakeFirst();
        if (!customer) throw new NotFoundException(`customer ${dto.customer_id} not found`);

        customerId = customer.id;
        currency = dto.currency ?? customer.currency ?? 'USD';
        lines = dto.lines.map((l) => {
          const lineTotal = +(l.quantity * l.unit_price * (1 + l.tax_pct / 100)).toFixed(2);
          return { ...l, line_total: lineTotal };
        });
      }

      const subtotal = +lines.reduce((acc, l) => acc + l.quantity * l.unit_price, 0).toFixed(2);
      const taxTotal = +lines
        .reduce((acc, l) => acc + (l.quantity * l.unit_price * l.tax_pct) / 100, 0)
        .toFixed(2);
      const total = +(subtotal + taxTotal).toFixed(2);

      const issueDate = dto.issue_date ?? today;
      // Default due = issue + 30. The customer's payment_terms_days is
      // available on the customers table; we keep things simple here and
      // let callers override.
      const dueDate =
        dto.due_date ??
        new Date(new Date(issueDate).getTime() + 30 * 24 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);

      const invoiceNo = `INV-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;

      const invoice = await trx
        .insertInto('invoices')
        .values({
          tenant_id: t.tenantId,
          invoice_no: invoiceNo,
          order_id: orderId,
          customer_id: customerId,
          issue_date: issueDate,
          due_date: dueDate,
          currency,
          fx_rate: '1',
          subtotal: subtotal.toFixed(2),
          tax_total: taxTotal.toFixed(2),
          total: total.toFixed(2),
          amount_paid: '0',
          balance_due: total.toFixed(2),
          status: 'issued',
          pdf_s3_key: null,
          recurring_rule: null,
          qbo_invoice_id: null,
          qbo_sync_status: null,
          qbo_last_sync_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (lines.length > 0) {
        await trx
          .insertInto('invoice_lines')
          .values(
            lines.map((l) => ({
              tenant_id: t.tenantId,
              invoice_id: invoice.id,
              product_id: l.product_id ?? null,
              description: l.description,
              quantity: l.quantity.toString(),
              unit_price: l.unit_price.toFixed(4),
              tax_pct: l.tax_pct.toFixed(2),
              line_total: l.line_total.toFixed(2),
            })),
          )
          .execute();
      }

      // AR ledger: an invoice increases the customer's outstanding balance.
      await trx
        .insertInto('ar_transactions')
        .values({
          tenant_id: t.tenantId,
          customer_id: customerId,
          invoice_id: invoice.id,
          payment_id: null,
          txn_type: 'invoice',
          amount: total.toFixed(2),
          currency,
        })
        .execute();

      await this.audit.log({
        action: 'create',
        entityType: 'invoice',
        entityId: invoice.id,
        after: {
          invoice_no: invoice.invoice_no,
          customer_id: customerId,
          order_id: orderId,
          total,
          currency,
          line_count: lines.length,
        },
      });

      return { ...invoice, lines };
    });
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
      await sql`SELECT set_config('app.tenant_id', ${t.tenantId}, true)`.execute(trx);
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
