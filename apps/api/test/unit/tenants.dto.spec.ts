import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirrors the schema in tenants.controller.ts.
const UpdateTenantSchema = z
  .object({
    name: z.string().min(1).max(200),
    base_currency: z.string().length(3),
    timezone: z.string().min(1).max(64),
    plan: z.string().min(1).max(32),
    default_tax_rate_pct: z.number().min(0).max(100),
  })
  .partial();

describe('Tenant update DTO', () => {
  it('accepts a partial patch', () => {
    expect(() => UpdateTenantSchema.parse({ default_tax_rate_pct: 7.8 })).not.toThrow();
    expect(() => UpdateTenantSchema.parse({})).not.toThrow();
  });

  it('rejects bad currency or out-of-range tax', () => {
    expect(() => UpdateTenantSchema.parse({ base_currency: 'US' })).toThrow();
    expect(() => UpdateTenantSchema.parse({ default_tax_rate_pct: 101 })).toThrow();
    expect(() => UpdateTenantSchema.parse({ default_tax_rate_pct: -1 })).toThrow();
  });
});
