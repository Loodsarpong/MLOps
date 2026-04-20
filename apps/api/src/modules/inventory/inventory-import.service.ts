import { Inject, Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';

interface StockRow {
  warehouse_code: string; sku: string; batch_no?: string;
  manufactured_on?: string; expires_on?: string;
  quantity: number; unit_cost?: number; reorder_point?: number;
}

interface ImportResult {
  accepted: number; rejected: number; errors: { row: number; field: string; error: string }[];
}

@Injectable()
export class InventoryImportService {
  private readonly log = new Logger(InventoryImportService.name);
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  /**
   * Parse pre-validated rows from a CSV and upsert into inventory_stock + batches.
   * Called by the import worker after schema validation + mapping.
   */
  async applyStock(rows: StockRow[]): Promise<ImportResult> {
    const t = currentTenant();
    const result: ImportResult = { accepted: 0, rejected: 0, errors: [] };

    await this.db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', ${t.tenantId}, true)`.execute(trx);
      let i = 0;
      for (const row of rows) {
        i += 1;
        try {
          const wh = await trx
            .selectFrom('warehouses')
            .select('id')
            .where('tenant_id', '=', t.tenantId)
            .where('code', '=', row.warehouse_code)
            .executeTakeFirst();
          if (!wh) throw new Error(`warehouse_code ${row.warehouse_code} not found`);

          const prod = await trx
            .selectFrom('products')
            .select(['id', 'is_tracked_by_batch'])
            .where('tenant_id', '=', t.tenantId)
            .where('sku', '=', row.sku)
            .executeTakeFirst();
          if (!prod) throw new Error(`sku ${row.sku} not found`);

          let batchId: string | null = null;
          if (prod.is_tracked_by_batch) {
            if (!row.batch_no) throw new Error('batch_no required (product tracked by batch)');
            const b = await trx
              .insertInto('batches')
              .values({
                tenant_id: t.tenantId,
                product_id: prod.id,
                batch_no: row.batch_no,
                manufactured_on: row.manufactured_on ?? null,
                expires_on: row.expires_on ?? null,
                cost_price: (row.unit_cost ?? 0).toFixed(4),
              })
              .onConflict((oc) =>
                oc.columns(['tenant_id', 'product_id', 'batch_no']).doUpdateSet({
                  manufactured_on: row.manufactured_on ?? null,
                  expires_on: row.expires_on ?? null,
                }),
              )
              .returning('id')
              .executeTakeFirstOrThrow();
            batchId = b.id;
          }

          await trx
            .insertInto('inventory_stock')
            .values({
              tenant_id: t.tenantId,
              product_id: prod.id,
              warehouse_id: wh.id,
              batch_id: batchId,
              quantity: row.quantity.toString(),
              reserved: '0',
              reorder_point: row.reorder_point?.toString() ?? null,
            })
            .onConflict((oc) =>
              oc.columns(['tenant_id', 'product_id', 'warehouse_id', 'batch_id']).doUpdateSet({
                quantity: row.quantity.toString(),
                reorder_point: row.reorder_point?.toString() ?? null,
              }),
            )
            .execute();

          result.accepted += 1;
        } catch (e) {
          result.rejected += 1;
          result.errors.push({ row: i, field: 'row', error: (e as Error).message });
        }
      }
    });

    return result;
  }
}
