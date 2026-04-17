import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';

@Injectable()
export class ReportsService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async salesDaily(from: string, to: string) {
    const t = currentTenant();
    const r = await sql<{ day: string; order_count: number; total: string }>`
      SELECT day::text AS day, order_count, total::text
      FROM mv_sales_daily
      WHERE tenant_id = ${t.tenantId} AND day BETWEEN ${from} AND ${to}
      ORDER BY day
    `.execute(this.db);
    return r.rows;
  }

  async arAging() {
    const t = currentTenant();
    const r = await sql`
      SELECT c.code, c.name,
             a.bucket_0_30, a.bucket_31_60, a.bucket_61_90, a.bucket_90_plus, a.total_due
      FROM mv_ar_aging a
      JOIN customers c ON c.id = a.customer_id
      WHERE a.tenant_id = ${t.tenantId}
      ORDER BY a.total_due DESC
    `.execute(this.db);
    return r.rows;
  }

  async topProducts(limit = 10) {
    const t = currentTenant();
    const r = await sql<{ sku: string; name: string; qty: string; revenue: string }>`
      SELECT p.sku, p.name,
             SUM(i.quantity)::text AS qty,
             SUM(i.line_total)::text AS revenue
      FROM sales_order_items i
      JOIN products p ON p.id = i.product_id
      JOIN sales_orders o ON o.id = i.order_id
      WHERE i.tenant_id = ${t.tenantId} AND o.status <> 'cancelled'
      GROUP BY p.sku, p.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `.execute(this.db);
    return r.rows;
  }

  async supplierPerformance() {
    const t = currentTenant();
    const r = await sql`
      SELECT s.code, s.name,
             COUNT(po.id) AS po_count,
             AVG(EXTRACT(EPOCH FROM (grn.received_at - po.created_at))/86400)::numeric(10,1) AS avg_lead_days,
             SUM(po.total) AS total_spend
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
      LEFT JOIN grn ON grn.po_id = po.id
      WHERE s.tenant_id = ${t.tenantId}
      GROUP BY s.code, s.name
      ORDER BY total_spend DESC NULLS LAST
    `.execute(this.db);
    return r.rows;
  }
}
