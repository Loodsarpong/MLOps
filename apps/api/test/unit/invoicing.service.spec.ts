import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tenant context — settable per test.
let mockTenant = { tenantId: 'T1', userId: 'U1', email: 'a@b.c', roles: ['admin'] };
vi.mock('../../src/common/tenancy/tenant.context', () => ({
  currentTenant: () => mockTenant,
}));

// Stub kysely's `sql` tagged-template and `set_config` execution so the service
// does not blow up when it asks for a tenant context inside the transaction.
vi.mock('kysely', async () => {
  const actual = await vi.importActual<any>('kysely');
  const sqlFn: any = (..._args: any[]) => ({ execute: vi.fn(async () => undefined) });
  sqlFn.raw = (s: string) => s;
  return { ...actual, sql: sqlFn };
});

// `nanoid` returns deterministic output for snapshot-style assertions.
vi.mock('nanoid', () => ({ nanoid: () => 'TESTID12' }));

type Capture = {
  invoiceInserts: any[];
  lineInserts: any[];
  arInserts: any[];
};

/**
 * Build a Kysely-shaped fluent mock that:
 *   - returns canned rows for selectFrom('sales_orders'|'customers'|...)
 *   - records every insertInto(...) call so the test can assert on them
 *   - implements db.transaction().execute(cb) by running cb against itself
 */
function makeDb(opts: {
  order?: any;
  orderItems?: any[];
  existingInvoiceForOrder?: { id: string } | null;
  customer?: any;
}): { db: any; capture: Capture } {
  const capture: Capture = { invoiceInserts: [], lineInserts: [], arInserts: [] };

  function selectFrom(table: string) {
    // Build a chainable that ignores .select / .selectAll / .leftJoin / .where
    // and resolves on .execute / .executeTakeFirst / .executeTakeFirstOrThrow.
    let result: any;
    if (table === 'sales_orders') result = opts.order;
    else if (table === 'customers') result = opts.customer;
    else if (table.startsWith('sales_order_items')) result = opts.orderItems ?? [];
    else if (table === 'invoices') result = opts.existingInvoiceForOrder ?? undefined;
    else result = undefined;

    const chain: any = {
      select: () => chain,
      selectAll: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      forUpdate: () => chain,
      execute: vi.fn(async () => (Array.isArray(result) ? result : result ? [result] : [])),
      executeTakeFirst: vi.fn(async () => (Array.isArray(result) ? result[0] : result)),
      executeTakeFirstOrThrow: vi.fn(async () => {
        const r = Array.isArray(result) ? result[0] : result;
        if (!r) throw new Error(`no row for ${table}`);
        return r;
      }),
    };
    return chain;
  }

  function insertInto(table: string) {
    return {
      values: (v: any) => {
        if (table === 'invoices') capture.invoiceInserts.push(v);
        else if (table === 'invoice_lines') {
          capture.lineInserts.push(...(Array.isArray(v) ? v : [v]));
        } else if (table === 'ar_transactions') capture.arInserts.push(v);
        else if (table === 'audit_logs') {
          /* AuditService is not exercised here */
        }
        return {
          execute: vi.fn(async () => undefined),
          returningAll: () => ({
            executeTakeFirstOrThrow: vi.fn(async () => ({
              ...v,
              id: 'INV-1',
              created_at: new Date(),
              updated_at: new Date(),
            })),
          }),
          returning: () => ({
            executeTakeFirstOrThrow: vi.fn(async () => ({ ...v, id: 'AR-1' })),
          }),
        };
      },
    };
  }

  const db: any = {
    selectFrom,
    insertInto,
    transaction: () => ({
      execute: async (cb: (trx: any) => Promise<any>) => cb(db),
    }),
  };
  return { db, capture };
}

const audit = { log: vi.fn(async () => undefined) } as any;

beforeEach(() => {
  mockTenant = { tenantId: 'T1', userId: 'U1', email: 'a@b.c', roles: ['admin'] };
  audit.log.mockReset();
  audit.log.mockResolvedValue(undefined);
  vi.resetModules();
});

async function makeService(db: any) {
  const { InvoicingService } = await import('../../src/modules/invoicing/invoicing.service');
  return new InvoicingService(db, audit);
}

describe('InvoicingService.create — manual entry', () => {
  it('inserts an invoice + lines + ar_transactions row and audits', async () => {
    const { db, capture } = makeDb({
      customer: { id: 'C1', currency: 'USD' },
    });
    const svc = await makeService(db);

    const result = await svc.create({
      customer_id: 'C1',
      currency: 'USD',
      issue_date: '2026-05-08',
      due_date: '2026-06-07',
      lines: [
        { description: 'Consulting', quantity: 2, unit_price: 50, tax_pct: 0 },
        { description: 'Body butter 200g', quantity: 4, unit_price: 25, tax_pct: 6.5 },
      ],
    } as any);

    expect(capture.invoiceInserts).toHaveLength(1);
    const inv = capture.invoiceInserts[0];
    expect(inv).toMatchObject({
      tenant_id: 'T1',
      customer_id: 'C1',
      currency: 'USD',
      status: 'issued',
      order_id: null,
    });
    expect(inv.invoice_no).toMatch(/^INV-\d{4}-TESTID12$/);
    // 2*50 + 4*25 = 200 subtotal; tax = 4*25*6.5/100 = 6.50; total = 206.50
    expect(inv.subtotal).toBe('200.00');
    expect(inv.tax_total).toBe('6.50');
    expect(inv.total).toBe('206.50');
    expect(inv.balance_due).toBe('206.50');
    expect(inv.amount_paid).toBe('0');

    expect(capture.lineInserts).toHaveLength(2);
    expect(capture.lineInserts[0]).toMatchObject({
      description: 'Consulting', quantity: '2', unit_price: '50.0000', tax_pct: '0.00',
    });

    expect(capture.arInserts).toHaveLength(1);
    expect(capture.arInserts[0]).toMatchObject({
      customer_id: 'C1', txn_type: 'invoice', currency: 'USD', amount: '206.50',
    });

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'create',
      entityType: 'invoice',
    }));

    expect(result.lines).toHaveLength(2);
  });

  it('rejects an unknown customer with NotFoundException', async () => {
    const { db } = makeDb({ customer: undefined });
    const svc = await makeService(db);
    await expect(
      svc.create({
        customer_id: 'C-MISSING',
        currency: 'USD',
        lines: [{ description: 'x', quantity: 1, unit_price: 1, tax_pct: 0 }],
      } as any),
    ).rejects.toThrow(/customer C-MISSING not found/);
  });
});

describe('InvoicingService.create — from sales order', () => {
  it('snapshots order line prices into the invoice', async () => {
    const { db, capture } = makeDb({
      order: {
        id: 'O1', tenant_id: 'T1', order_no: 'SO-2026-ABCD',
        customer_id: 'C1', status: 'confirmed', currency: 'USD',
      },
      orderItems: [
        {
          product_id: 'P1', quantity: '3', unit_price: '20.00',
          tax_pct: '6.5', line_total: '63.90', product_name: 'Soap 100g',
        },
      ],
      existingInvoiceForOrder: null,
    });
    const svc = await makeService(db);

    const result = await svc.create({ order_id: 'O1' } as any);

    expect(capture.invoiceInserts[0]).toMatchObject({
      order_id: 'O1', customer_id: 'C1', currency: 'USD', status: 'issued',
    });
    // Tax is recomputed from snapshotted unit_price/quantity/tax_pct, not re-read.
    expect(capture.invoiceInserts[0].subtotal).toBe('60.00');
    expect(capture.invoiceInserts[0].tax_total).toBe('3.90');
    expect(capture.invoiceInserts[0].total).toBe('63.90');

    expect(capture.lineInserts).toHaveLength(1);
    expect(capture.lineInserts[0]).toMatchObject({
      product_id: 'P1', description: 'Soap 100g', quantity: '3',
    });

    expect(result.order_id).toBe('O1');
  });

  it('refuses to invoice the same order twice', async () => {
    const { db } = makeDb({
      order: {
        id: 'O1', order_no: 'SO-2026-ABCD',
        customer_id: 'C1', status: 'confirmed', currency: 'USD',
      },
      existingInvoiceForOrder: { id: 'INV-EXISTING' },
    });
    const svc = await makeService(db);
    await expect(svc.create({ order_id: 'O1' } as any)).rejects.toThrow(/already invoiced/);
  });

  it('refuses to invoice a cancelled order', async () => {
    const { db } = makeDb({
      order: {
        id: 'O1', order_no: 'SO-2026-ABCD',
        customer_id: 'C1', status: 'cancelled', currency: 'USD',
      },
    });
    const svc = await makeService(db);
    await expect(svc.create({ order_id: 'O1' } as any)).rejects.toThrow(/cannot invoice a cancelled order/);
  });

  it('refuses to invoice an order without a customer', async () => {
    const { db } = makeDb({
      order: {
        id: 'O1', order_no: 'SO-2026-ABCD',
        customer_id: null, status: 'confirmed', currency: 'USD',
      },
    });
    const svc = await makeService(db);
    await expect(svc.create({ order_id: 'O1' } as any)).rejects.toThrow(
      /cannot invoice a sales_order without a customer/,
    );
  });
});
