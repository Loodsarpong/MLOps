import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';

@Injectable()
export class InventoryService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async stock(params: { warehouseId?: string; productId?: string; expiringWithinDays?: number }) {
    const t = currentTenant();
    let q = this.db
      .selectFrom('inventory_stock as s')
      .innerJoin('products as p', 'p.id', 's.product_id')
      .innerJoin('warehouses as w', 'w.id', 's.warehouse_id')
      .leftJoin('batches as b', 'b.id', 's.batch_id')
      .select([
        's.id', 's.quantity', 's.reserved', 's.reorder_point', 's.updated_at',
        'p.sku', 'p.name', 'w.code as warehouse_code', 'w.name as warehouse_name',
        'b.batch_no', 'b.expires_on',
      ])
      .where('s.tenant_id', '=', t.tenantId);
    if (params.warehouseId) q = q.where('s.warehouse_id', '=', params.warehouseId);
    if (params.productId) q = q.where('s.product_id', '=', params.productId);
    if (params.expiringWithinDays) {
      q = q.where('b.expires_on', '<=', sql<string>`current_date + ${params.expiringWithinDays}` as never);
    }
    return q.orderBy('p.name').execute();
  }

  async lowStock() {
    const t = currentTenant();
    return this.db
      .selectFrom('inventory_stock as s')
      .innerJoin('products as p', 'p.id', 's.product_id')
      .innerJoin('warehouses as w', 'w.id', 's.warehouse_id')
      .select([
        's.quantity', 's.reorder_point', 'p.sku', 'p.name',
        'w.code as warehouse_code', 'w.name as warehouse_name',
      ])
      .where('s.tenant_id', '=', t.tenantId)
      .where('s.reorder_point', 'is not', null)
      .where(sql<boolean>`s.quantity <= s.reorder_point`)
      .orderBy('s.quantity')
      .execute();
  }

  async valuation(method: 'fifo' | 'lifo') {
    const t = currentTenant();
    const order = method === 'fifo' ? 'ASC' : 'DESC';
    const rows = await sql<{
      product_id: string; sku: string; name: string;
      quantity: string; valuation: string;
    }>`
      WITH ordered AS (
        SELECT s.product_id, p.sku, p.name, s.quantity::numeric AS qty,
               COALESCE(b.cost_price, p.cost_price)::numeric AS cost,
               ROW_NUMBER() OVER (PARTITION BY s.product_id ORDER BY b.manufactured_on ${sql.raw(order)} NULLS LAST) AS rn
        FROM inventory_stock s
        JOIN products p ON p.id = s.product_id
        LEFT JOIN batches b ON b.id = s.batch_id
        WHERE s.tenant_id = ${t.tenantId} AND s.quantity > 0
      )
      SELECT product_id, sku, name, SUM(qty)::text AS quantity, SUM(qty * cost)::text AS valuation
      FROM ordered
      GROUP BY product_id, sku, name
      ORDER BY name
    `.execute(this.db);
    return rows.rows;
  }

  async adjust(body: {
    product_id: string; warehouse_id: string; batch_id?: string;
    delta: number; reason: string;
  }) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      await sql`SET LOCAL app.tenant_id = ${t.tenantId}`.execute(trx);
      await trx
        .insertInto('inventory_stock')
        .values({
          tenant_id: t.tenantId,
          product_id: body.product_id,
          warehouse_id: body.warehouse_id,
          batch_id: body.batch_id ?? null,
          quantity: body.delta.toString(),
          reserved: '0',
        })
        .onConflict((oc) =>
          oc.columns(['tenant_id', 'product_id', 'warehouse_id', 'batch_id']).doUpdateSet({
            quantity: sql`inventory_stock.quantity + ${body.delta}` as never,
          }),
        )
        .execute();

      await trx
        .insertInto('stock_movements')
        .values({
          tenant_id: t.tenantId,
          product_id: body.product_id,
          warehouse_id: body.warehouse_id,
          batch_id: body.batch_id ?? null,
          movement_type: 'adjustment',
          quantity: body.delta.toString(),
          reference_type: 'manual',
          performed_by: t.userId,
        })
        .execute();

      return { ok: true };
    });
  }
}
