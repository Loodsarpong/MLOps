import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { nanoid } from 'nanoid';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { PosSaleDto } from './pos.dto';

/**
 * Handles a POS sale atomically:
 *   1. Lock + allocate inventory (FIFO by batch expiry).
 *   2. Insert order + items + invoice + invoice lines + payment.
 *   3. Decrement stock + write stock_movements.
 *   4. Emit `invoice.pdf` and `qbo.sync` jobs (left as stubs here).
 */
@Injectable()
export class PosService {
  private readonly log = new Logger(PosService.name);

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async recordSale(dto: PosSaleDto) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', ${t.tenantId}, true)`.execute(trx);

      // Look up tenant default tax rate; honor the cashier's apply_tax toggle.
      const tenant = await trx
        .selectFrom('tenants')
        .select(['default_tax_rate_pct'])
        .where('id', '=', t.tenantId)
        .executeTakeFirstOrThrow();
      const taxRatePct = dto.apply_tax ? Number(tenant.default_tax_rate_pct) : 0;

      const subtotal = dto.items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0);
      const taxTotal = +((subtotal * taxRatePct) / 100).toFixed(2);
      const discountTotal = dto.discount_total;
      const total = +(subtotal + taxTotal - discountTotal).toFixed(2);

      const orderNo = `SO-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
      const invoiceNo = `INV-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;

      // 1. Order
      const order = await trx
        .insertInto('sales_orders')
        .values({
          tenant_id: t.tenantId,
          order_no: orderNo,
          customer_id: dto.customer_id ?? null,
          warehouse_id: dto.warehouse_id,
          channel: 'pos',
          status: 'confirmed',
          currency: dto.currency,
          fx_rate: String(dto.fx_rate),
          subtotal: subtotal.toFixed(2),
          discount_total: discountTotal.toFixed(2),
          tax_total: taxTotal.toFixed(2),
          total: total.toFixed(2),
          tax_applied: dto.apply_tax,
          tax_rate_pct: taxRatePct.toFixed(2),
          created_by: t.userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 2. Items + stock allocation (FIFO).
      // Line totals are pre-tax (discount applied); tax is order-level.
      for (const item of dto.items) {
        const lineTotal = +(
          item.unit_price * item.quantity * (1 - item.discount_pct / 100)
        ).toFixed(2);

        await trx
          .insertInto('sales_order_items')
          .values({
            tenant_id: t.tenantId,
            order_id: order.id,
            product_id: item.product_id,
            batch_id: item.batch_id ?? null,
            quantity: String(item.quantity),
            unit_price: item.unit_price.toFixed(4),
            discount_pct: item.discount_pct.toFixed(2),
            tax_pct: taxRatePct.toFixed(2),
            line_total: lineTotal.toFixed(2),
          })
          .execute();

        await this.allocateStock(trx, item.product_id, dto.warehouse_id, item.quantity, order.id);
      }

      // 3. Invoice
      const invoice = await trx
        .insertInto('invoices')
        .values({
          tenant_id: t.tenantId,
          invoice_no: invoiceNo,
          order_id: order.id,
          customer_id: dto.customer_id ?? (await this.walkInCustomerId(trx)),
          issue_date: new Date().toISOString().slice(0, 10),
          due_date: new Date().toISOString().slice(0, 10),
          currency: dto.currency,
          fx_rate: String(dto.fx_rate),
          subtotal: subtotal.toFixed(2),
          tax_total: taxTotal.toFixed(2),
          total: total.toFixed(2),
          amount_paid: '0',
          balance_due: total.toFixed(2),
          status: 'issued',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 4. Invoice lines
      for (const item of dto.items) {
        await trx
          .insertInto('invoice_lines')
          .values({
            tenant_id: t.tenantId,
            invoice_id: invoice.id,
            product_id: item.product_id,
            description: `SKU ${item.product_id}`,
            quantity: String(item.quantity),
            unit_price: item.unit_price.toFixed(4),
            tax_pct: taxRatePct.toFixed(2),
            line_total: (item.unit_price * item.quantity).toFixed(2),
          })
          .execute();
      }

      // 5. Payment (POS is always instantaneous)
      const paidAmount = dto.payment.amount ?? total;
      const payment = await trx
        .insertInto('payments')
        .values({
          tenant_id: t.tenantId,
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          amount: paidAmount.toFixed(2),
          currency: dto.currency,
          method: dto.payment.method,
          reference: dto.payment.reference ?? null,
          recorded_by: t.userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('invoices')
        .set({
          amount_paid: paidAmount.toFixed(2),
          balance_due: (total - paidAmount).toFixed(2),
          status: paidAmount >= total ? 'paid' : 'partial',
        })
        .where('id', '=', invoice.id)
        .execute();

      await trx
        .insertInto('ar_transactions')
        .values([
          {
            tenant_id: t.tenantId,
            customer_id: invoice.customer_id,
            invoice_id: invoice.id,
            txn_type: 'invoice',
            amount: total.toFixed(2),
            currency: dto.currency,
          },
          {
            tenant_id: t.tenantId,
            customer_id: invoice.customer_id,
            invoice_id: invoice.id,
            payment_id: payment.id,
            txn_type: 'payment',
            amount: (-paidAmount).toFixed(2),
            currency: dto.currency,
          },
        ])
        .execute();

      await this.audit.log({ action: 'create', entityType: 'pos_sale', entityId: order.id });

      // Snapshot what the post-commit email handler needs.
      const fulfillment = await this.collectFulfillmentPayload(trx, {
        orderId: order.id,
        orderNo: order.order_no,
        invoiceNo: invoice.invoice_no,
        warehouseId: dto.warehouse_id,
        customerId: invoice.customer_id,
        paymentMethod: dto.payment.method,
        currency: dto.currency,
        totals: { subtotal, tax: taxTotal, total },
      });

      // TODO: SQS enqueue invoice.pdf + qbo.sync (stubbed; see workers/)
      return {
        result: {
          id: order.id,
          order_no: order.order_no,
          invoice: { id: invoice.id, invoice_no: invoice.invoice_no, pdf_url: null },
          totals: { subtotal, tax_total: taxTotal, discount_total: discountTotal, total },
        },
        fulfillment,
      };
    }).then(async ({ result, fulfillment }) => {
      // Post-commit, fire-and-forget: SES/SQS failure must not roll back the sale.
      // Idempotency is enforced by notification_log's UNIQUE (ref_type, ref_id).
      if (fulfillment) {
        this.notifications
          .sendOrderFulfillmentEmail(fulfillment)
          .catch((e) =>
            this.log.error(`order-fulfillment dispatch failed for ${result.order_no}`, e as Error),
          );
      }
      return result;
    });
  }

  private async collectFulfillmentPayload(
    trx: Kysely<Database>,
    args: {
      orderId: string;
      orderNo: string;
      invoiceNo: string;
      warehouseId: string;
      customerId: string;
      paymentMethod: string;
      currency: string;
      totals: { subtotal: number; tax: number; total: number };
    },
  ) {
    const wh = await trx
      .selectFrom('warehouses')
      .select(['id', 'code', 'name', 'clerk_name', 'clerk_email', 'address'])
      .where('id', '=', args.warehouseId)
      .executeTakeFirst();
    if (!wh || !wh.clerk_email) return null;

    const customer = await trx
      .selectFrom('customers')
      .select(['name'])
      .where('id', '=', args.customerId)
      .executeTakeFirst();

    const items = await trx
      .selectFrom('sales_order_items as soi')
      .leftJoin('products as p', 'p.id', 'soi.product_id')
      .select([
        'p.sku as sku',
        'p.name as description',
        'soi.quantity',
        'soi.unit_price',
        'soi.line_total',
      ])
      .where('soi.order_id', '=', args.orderId)
      .execute();

    return {
      orderId: args.orderId,
      orderNo: args.orderNo,
      invoiceNo: args.invoiceNo,
      warehouse: wh,
      customerName: customer?.name ?? null,
      paymentMethod: args.paymentMethod,
      currency: args.currency,
      totals: args.totals,
      lines: items.map((i) => ({
        sku: i.sku,
        description: i.description ?? '',
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        line_total: Number(i.line_total),
      })),
      occurredAt: new Date(),
    };
  }

  /**
   * FIFO batch allocation: consume from batches with the nearest `expires_on`
   * first. Uses SELECT ... FOR UPDATE to serialize concurrent outlets.
   */
  private async allocateStock(
    trx: Kysely<Database>,
    productId: string,
    warehouseId: string,
    needed: number,
    orderId: string,
  ) {
    const t = currentTenant();
    const rows = await sql<{
      id: string; batch_id: string | null; quantity: string; expires_on: string | null;
    }>`
      SELECT s.id, s.batch_id, s.quantity::text, b.expires_on
      FROM inventory_stock s
      LEFT JOIN batches b ON b.id = s.batch_id
      WHERE s.tenant_id = ${t.tenantId}
        AND s.product_id = ${productId}
        AND s.warehouse_id = ${warehouseId}
        AND s.quantity > 0
      ORDER BY b.expires_on NULLS LAST, s.updated_at
      FOR UPDATE OF s
    `.execute(trx);

    let remaining = needed;
    for (const row of rows.rows) {
      if (remaining <= 0) break;
      const available = Number(row.quantity);
      const take = Math.min(available, remaining);

      await trx
        .updateTable('inventory_stock')
        .set({ quantity: (available - take).toString() })
        .where('id', '=', row.id)
        .execute();

      await trx
        .insertInto('stock_movements')
        .values({
          tenant_id: t.tenantId,
          product_id: productId,
          warehouse_id: warehouseId,
          batch_id: row.batch_id,
          movement_type: 'issue',
          quantity: (-take).toString(),
          reference_type: 'sales_order',
          reference_id: orderId,
          performed_by: t.userId,
        })
        .execute();

      remaining -= take;
    }
    if (remaining > 0) {
      throw new BadRequestException(
        `Insufficient stock for product ${productId} in warehouse ${warehouseId} (short ${remaining})`,
      );
    }
  }

  private async walkInCustomerId(trx: Kysely<Database>): Promise<string> {
    const t = currentTenant();
    const row = await trx
      .selectFrom('customers')
      .select('id')
      .where('tenant_id', '=', t.tenantId)
      .where('code', '=', 'CUST-0003')
      .executeTakeFirst();
    if (!row) throw new BadRequestException('Walk-in customer not configured');
    return row.id;
  }
}
