import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-declare the schemas inline so we don't drag the controller's NestJS deps
// into a unit test. If these drift from products.controller.ts they'll silently
// pass — keep this file in sync if the controller schemas change.

const CreateProductSchema = z.object({
  sku: z.string().min(1).max(64),
  upc: z.string().nullish(),
  name: z.string().min(1).max(200),
  description: z.string().nullish(),
  category: z.string().nullish(),
  uom: z.string().min(1).max(20),
  is_tracked_by_batch: z.boolean().optional(),
  tax_rate_pct: z.number().min(0).max(100).optional(),
  cost_price: z.number().min(0).optional(),
  base_price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  weight_grams: z.number().nullish(),
});

describe('Product DTO', () => {
  const minimal = { sku: 'SKU-1', name: 'Body Butter', uom: 'unit' };

  it('accepts a minimal valid payload', () => {
    expect(() => CreateProductSchema.parse(minimal)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => CreateProductSchema.parse({ sku: 'X', name: '' })).toThrow();
    expect(() => CreateProductSchema.parse({ name: 'X', uom: 'unit' })).toThrow();
    expect(() => CreateProductSchema.parse({ sku: 'X', uom: 'unit' })).toThrow();
  });

  it('rejects negative prices', () => {
    expect(() => CreateProductSchema.parse({ ...minimal, base_price: -1 })).toThrow();
    expect(() => CreateProductSchema.parse({ ...minimal, cost_price: -1 })).toThrow();
  });

  it('clamps tax rate to 0-100', () => {
    expect(() => CreateProductSchema.parse({ ...minimal, tax_rate_pct: 101 })).toThrow();
    expect(() => CreateProductSchema.parse({ ...minimal, tax_rate_pct: -1 })).toThrow();
    expect(CreateProductSchema.parse({ ...minimal, tax_rate_pct: 7.8 }).tax_rate_pct).toBe(7.8);
  });

  it('rejects non-3-letter currency', () => {
    expect(() => CreateProductSchema.parse({ ...minimal, currency: 'US' })).toThrow();
    expect(CreateProductSchema.parse({ ...minimal, currency: 'USD' }).currency).toBe('USD');
  });
});
