import { describe, it, expect } from 'vitest';
import { PosSaleSchema } from '../../src/modules/pos/pos.dto';

describe('PosSaleSchema', () => {
  const minimal = {
    warehouse_id: '00000000-0000-0000-0000-000000000001',
    items: [{ product_id: '00000000-0000-0000-0000-000000000002', quantity: 1, unit_price: 10 }],
    payment: { method: 'cash' as const },
  };

  it('defaults currency to USD', () => {
    const r = PosSaleSchema.parse(minimal);
    expect(r.currency).toBe('USD');
  });

  it('defaults apply_tax to true so cashiers must opt-out for tax-exempt sales', () => {
    const r = PosSaleSchema.parse(minimal);
    expect(r.apply_tax).toBe(true);
  });

  it('honors explicit apply_tax=false', () => {
    const r = PosSaleSchema.parse({ ...minimal, apply_tax: false });
    expect(r.apply_tax).toBe(false);
  });

  it('rejects payloads with no items', () => {
    expect(() => PosSaleSchema.parse({ ...minimal, items: [] })).toThrow();
  });

  it('rejects non-numeric currency length', () => {
    expect(() => PosSaleSchema.parse({ ...minimal, currency: 'US' })).toThrow();
  });
});
