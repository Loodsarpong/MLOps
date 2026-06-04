import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { nanoid } from 'nanoid';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';
import { AuditService } from '../../common/audit/audit.service';

export interface ListFilters {
  status?: string;
  supplier_id?: string;
}

export interface PoLineInput {
  product_id: string;
  quantity: number;
  unit_cost: number;
  tax_pct?: number;
}

export interface CreatePoInput {
  supplier_id: string;
  warehouse_id: string;
  currency?: string;
  expected_date?: string | null;
  items: PoLineInput[];
}

export interface GrnLineInput {
  po_item_id: string;
  quantity: number;
  unit_cost?: number;
  batch_id?: string | null;
}

export interface ReceiveGrnInput {
  grn_no?: string;
  items: GrnLineInput[];
}

@Injectable()
export class ProcurementService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    private readonly audit: AuditService,
  ) {}

  async list(filters: ListFilters = {}) {
    const t = currentTenant();
    let q = this.db
      .selectFrom('purchase_orders as po')
      .innerJoin('suppliers as s', 's.id', 'po.supplier_id')
      .select([
        'po.id', 'po.po_no', 'po.supplier_id', 's.name as supplier_name',
        'po.warehouse_id', 'po.status', 'po.currency',
        'po.subtotal', 'po.tax_total', 'po.total',
        'po.expected_date', 'po.created_at',
      ])
      .where('po.tenant_id', '=', t.tenantId);
    if (filters.status) q = q.where('po.status', '=', filters.status as never);
    if (filters.supplier_id) q = q.where('po.supplier_id', '=', filters.supplier_id);
    return q.orderBy('po.created_at', 'desc').execute();
  }

  async findById(id: string) {
    const t = currentTenant();
    const po = await this.db
      .selectFrom('purchase_orders')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .executeTakeFirst();
    if (!po) throw new NotFoundException('Purchase order not found');

    const items = await this.db
      .selectFrom('po_items as pi')
      .leftJoin('products as p', 'p.id', 'pi.product_id')
      .select([
        'pi.id', 'pi.product_id', 'p.sku', 'p.name as product_name',
        'pi.quantity', 'pi.received_qty', 'pi.unit_cost', 'pi.tax_pct', 'pi.line_total',
      ])
      .where('pi.po_id', '=', id)
      .where('pi.tenant_id', '=', t.tenantId)
      .execute();

    return { ...po, items };
  }

  async create(input: CreatePoInput) {
    const t = currentTenant();
    if (!input.items.length) throw new BadRequestException('A purchase order needs at least one line');

    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', ${t.tenantId}, true)`.execute(trx);

      const supplier = await trx
        .selectFrom('suppliers')
        .select(['id', 'currency'])
        .where('id', '=', input.supplier_id)
        .where('tenant_id', '=', t.tenantId)
        .executeTakeFirst();
      if (!supplier) throw new BadRequestException('Unknown supplier');

      const warehouse = await trx
        .selectFrom('warehouses')
        .select('id')
        .where('id', '=', input.warehouse_id)
        .where('tenant_id', '=', t.tenantId)
        .executeTakeFirst();
      if (!warehouse) throw new BadRequestException('Unknown warehouse');

      const currency = input.currency ?? supplier.currency;
      let subtotal = 0;
      let taxTotal = 0;
      const lines = input.items.map((i) => {
        const lineTotal = +(i.unit_cost * i.quantity).toFixed(2);
        const taxPct = i.tax_pct ?? 0;
        subtotal += lineTotal;
        taxTotal += +((lineTotal * taxPct) / 100).toFixed(2);
        return { ...i, taxPct, lineTotal };
      });
      subtotal = +subtotal.toFixed(2);
      taxTotal = +taxTotal.toFixed(2);
      const total = +(subtotal + taxTotal).toFixed(2);

      const poNo = `PO-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
      const po = await trx
        .insertInto('purchase_orders')
        .values({
          tenant_id: t.tenantId,
          po_no: poNo,
          supplier_id: input.supplier_id,
          warehouse_id: input.warehouse_id,
          status: 'draft',
          currency,
          subtotal: subtotal.toFixed(2),
          tax_total: taxTotal.toFixed(2),
          total: total.toFixed(2),
          expected_date: input.expected_date ?? null,
          created_by: t.userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      for (const line of lines) {
        await trx
          .insertInto('po_items')
          .values({
            tenant_id: t.tenantId,
            po_id: po.id,
            product_id: line.product_id,
            quantity: line.quantity.toString(),
            received_qty: '0',
            unit_cost: line.unit_cost.toFixed(4),
            tax_pct: line.taxPct.toFixed(2),
            line_total: line.lineTotal.toFixed(2),
          })
          .execute();
      }

      await this.audit.log({ action: 'create', entityType: 'purchase_order', entityId: po.id });
      return this.findById(po.id);
    });
  }

  async approve(id: string) {
    const t = currentTenant();
    const po = await this.requireStatus(id, ['draft']);
    await this.db
      .updateTable('purchase_orders')
      .set({ status: 'approved', approved_by: t.userId, approved_at: new Date() })
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .execute();
    await this.audit.log({ action: 'approve', entityType: 'purchase_order', entityId: po.id });
    return this.findById(id);
  }

  async send(id: string) {
    const t = currentTenant();
    await this.requireStatus(id, ['approved']);
    await this.db
      .updateTable('purchase_orders')
      .set({ status: 'sent' })
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .execute();
    return this.findById(id);
  }

  /**
   * Goods receipt: records a GRN, increments received quantities, moves stock
   * into inventory, raises a supplier bill (AP), and advances the PO status to
   * `partial` or `received`. Runs atomically.
   */
  async receiveGrn(id: string, input: ReceiveGrnInput) {
    const t = currentTenant();
    if (!input.items.length) throw new BadRequestException('A GRN needs at least one line');

    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT set_config('app.tenant_id', ${t.tenantId}, true)`.execute(trx);

      const po = await trx
        .selectFrom('purchase_orders')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', t.tenantId)
        .executeTakeFirst();
      if (!po) throw new NotFoundException('Purchase order not found');
      if (!['approved', 'sent', 'partial'].includes(po.status)) {
        throw new ConflictException(`Cannot receive against a PO in status ${po.status}`);
      }

      const grnNo = input.grn_no ?? `GRN-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
      const grn = await trx
        .insertInto('grn')
        .values({
          tenant_id: t.tenantId,
          po_id: po.id,
          grn_no: grnNo,
          received_by: t.userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      let billAmount = 0;
      for (const line of input.items) {
        if (line.quantity <= 0) throw new BadRequestException('GRN quantity must be positive');

        const poItem = await trx
          .selectFrom('po_items')
          .selectAll()
          .where('id', '=', line.po_item_id)
          .where('po_id', '=', po.id)
          .where('tenant_id', '=', t.tenantId)
          .executeTakeFirst();
        if (!poItem) throw new BadRequestException(`PO line ${line.po_item_id} not on this order`);

        const alreadyReceived = Number(poItem.received_qty);
        const ordered = Number(poItem.quantity);
        if (alreadyReceived + line.quantity > ordered + 1e-9) {
          throw new BadRequestException(
            `Over-receipt on line ${line.po_item_id}: ordered ${ordered}, already ${alreadyReceived}, now ${line.quantity}`,
          );
        }

        const unitCost = line.unit_cost ?? Number(poItem.unit_cost);
        const taxPct = Number(poItem.tax_pct);
        const lineCost = unitCost * line.quantity;
        billAmount += lineCost + (lineCost * taxPct) / 100;

        await trx
          .insertInto('grn_items')
          .values({
            tenant_id: t.tenantId,
            grn_id: grn.id,
            po_item_id: poItem.id,
            batch_id: line.batch_id ?? null,
            quantity: line.quantity.toString(),
            unit_cost: unitCost.toFixed(4),
          })
          .execute();

        await trx
          .updateTable('po_items')
          .set({ received_qty: (alreadyReceived + line.quantity).toString() })
          .where('id', '=', poItem.id)
          .execute();

        // Move stock into the PO's warehouse (one row per product/warehouse/batch).
        await trx
          .insertInto('inventory_stock')
          .values({
            tenant_id: t.tenantId,
            product_id: poItem.product_id,
            warehouse_id: po.warehouse_id,
            batch_id: line.batch_id ?? null,
            quantity: line.quantity.toString(),
            reserved: '0',
          })
          .onConflict((oc) =>
            oc.columns(['tenant_id', 'product_id', 'warehouse_id', 'batch_id']).doUpdateSet({
              quantity: sql`inventory_stock.quantity + ${line.quantity}` as never,
            }),
          )
          .execute();

        await trx
          .insertInto('stock_movements')
          .values({
            tenant_id: t.tenantId,
            product_id: poItem.product_id,
            warehouse_id: po.warehouse_id,
            batch_id: line.batch_id ?? null,
            movement_type: 'receipt',
            quantity: line.quantity.toString(),
            unit_cost: unitCost.toFixed(4),
            reference_type: 'grn',
            reference_id: grn.id,
            performed_by: t.userId,
          })
          .execute();
      }

      // Recompute PO status from the (now updated) lines.
      const remaining = await trx
        .selectFrom('po_items')
        .select((eb) => eb.fn.sum<string>(sql`quantity - received_qty`).as('outstanding'))
        .where('po_id', '=', po.id)
        .where('tenant_id', '=', t.tenantId)
        .executeTakeFirst();
      const outstanding = Number(remaining?.outstanding ?? 0);
      const newStatus = outstanding <= 1e-9 ? 'received' : 'partial';
      await trx
        .updateTable('purchase_orders')
        .set({ status: newStatus })
        .where('id', '=', po.id)
        .execute();

      // Raise a supplier bill for the received value.
      const supplier = await trx
        .selectFrom('suppliers')
        .select(['payment_terms_days'])
        .where('id', '=', po.supplier_id)
        .executeTakeFirst();
      const termsDays = supplier?.payment_terms_days ?? 30;
      const dueDate = new Date(Date.now() + termsDays * 86_400_000).toISOString().slice(0, 10);

      await trx
        .insertInto('ap_transactions')
        .values({
          tenant_id: t.tenantId,
          supplier_id: po.supplier_id,
          po_id: po.id,
          txn_type: 'bill',
          amount: billAmount.toFixed(2),
          currency: po.currency,
          due_date: dueDate,
          expense_category: 'inventory',
        })
        .execute();

      await this.audit.log({ action: 'update', entityType: 'grn', entityId: grn.id });

      return {
        grn: { id: grn.id, grn_no: grn.grn_no },
        po_status: newStatus,
        bill_amount: +billAmount.toFixed(2),
      };
    });
  }

  private async requireStatus(id: string, allowed: string[]) {
    const t = currentTenant();
    const po = await this.db
      .selectFrom('purchase_orders')
      .select(['id', 'status'])
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .executeTakeFirst();
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!allowed.includes(po.status)) {
      throw new ConflictException(`PO is ${po.status}; expected one of ${allowed.join(', ')}`);
    }
    return po;
  }
}
