import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirrors the schemas in procurement.controller.ts. Keep in sync if they change.
const PoLineSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_cost: z.number().min(0),
  tax_pct: z.number().min(0).max(100).optional(),
});

const CreatePoSchema = z.object({
  supplier_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  currency: z.string().length(3).optional(),
  expected_date: z.string().date().nullish(),
  items: z.array(PoLineSchema).min(1),
});

const GrnSchema = z.object({
  grn_no: z.string().max(64).optional(),
  items: z
    .array(
      z.object({
        po_item_id: z.string().uuid(),
        quantity: z.number().positive(),
        unit_cost: z.number().min(0).optional(),
        batch_id: z.string().uuid().nullish(),
      }),
    )
    .min(1),
});

const SUPPLIER = '11111111-1111-1111-1111-111111111111';
const WAREHOUSE = '22222222-2222-2222-2222-222222222222';
const PRODUCT = '33333333-3333-3333-3333-333333333333';
const PO_ITEM = '44444444-4444-4444-4444-444444444444';

describe('Purchase order DTO', () => {
  const validPo = {
    supplier_id: SUPPLIER,
    warehouse_id: WAREHOUSE,
    items: [{ product_id: PRODUCT, quantity: 10, unit_cost: 4.5 }],
  };

  it('accepts a valid PO', () => {
    expect(() => CreatePoSchema.parse(validPo)).not.toThrow();
  });

  it('requires at least one line', () => {
    expect(() => CreatePoSchema.parse({ ...validPo, items: [] })).toThrow();
  });

  it('rejects non-uuid ids and non-positive quantities', () => {
    expect(() => CreatePoSchema.parse({ ...validPo, supplier_id: 'nope' })).toThrow();
    expect(() =>
      CreatePoSchema.parse({ ...validPo, items: [{ product_id: PRODUCT, quantity: 0, unit_cost: 1 }] }),
    ).toThrow();
    expect(() =>
      CreatePoSchema.parse({ ...validPo, items: [{ product_id: PRODUCT, quantity: 1, unit_cost: -1 }] }),
    ).toThrow();
  });

  it('rejects a malformed expected_date', () => {
    expect(() => CreatePoSchema.parse({ ...validPo, expected_date: '2026/01/01' })).toThrow();
    expect(CreatePoSchema.parse({ ...validPo, expected_date: '2026-01-01' }).expected_date).toBe('2026-01-01');
  });
});

describe('GRN DTO', () => {
  it('accepts a valid receipt', () => {
    expect(() =>
      GrnSchema.parse({ items: [{ po_item_id: PO_ITEM, quantity: 5 }] }),
    ).not.toThrow();
  });

  it('rejects empty or non-positive receipts', () => {
    expect(() => GrnSchema.parse({ items: [] })).toThrow();
    expect(() => GrnSchema.parse({ items: [{ po_item_id: PO_ITEM, quantity: -1 }] })).toThrow();
  });
});
