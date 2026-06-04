import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirrors the schemas in suppliers.controller.ts. Keep in sync if they change.
const CreateSupplierSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  contact_name: z.string().max(200).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  address: z.record(z.unknown()).nullish(),
  payment_terms_days: z.number().int().min(0).max(365).optional(),
  currency: z.string().length(3).optional(),
  rating: z.number().min(0).max(5).nullish(),
});

describe('Supplier DTO', () => {
  const minimal = { code: 'SUP-1', name: 'Northern Shea Co-op' };

  it('accepts a minimal valid payload', () => {
    expect(() => CreateSupplierSchema.parse(minimal)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => CreateSupplierSchema.parse({ code: 'X' })).toThrow();
    expect(() => CreateSupplierSchema.parse({ name: 'X' })).toThrow();
    expect(() => CreateSupplierSchema.parse({ code: '', name: 'X' })).toThrow();
  });

  it('rejects an invalid email', () => {
    expect(() => CreateSupplierSchema.parse({ ...minimal, email: 'not-an-email' })).toThrow();
    expect(CreateSupplierSchema.parse({ ...minimal, email: null }).email).toBeNull();
  });

  it('bounds rating to 0-5 and terms to 0-365', () => {
    expect(() => CreateSupplierSchema.parse({ ...minimal, rating: 6 })).toThrow();
    expect(() => CreateSupplierSchema.parse({ ...minimal, payment_terms_days: 400 })).toThrow();
    expect(() => CreateSupplierSchema.parse({ ...minimal, payment_terms_days: 1.5 })).toThrow();
    expect(CreateSupplierSchema.parse({ ...minimal, rating: 4.5 }).rating).toBe(4.5);
  });

  it('rejects non-3-letter currency', () => {
    expect(() => CreateSupplierSchema.parse({ ...minimal, currency: 'US' })).toThrow();
    expect(CreateSupplierSchema.parse({ ...minimal, currency: 'USD' }).currency).toBe('USD');
  });
});
