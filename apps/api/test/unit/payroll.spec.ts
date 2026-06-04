import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { estimateMonthlyTax } from '../../src/modules/payroll/payroll.util';

describe('estimateMonthlyTax', () => {
  it('is zero up to the first bracket', () => {
    expect(estimateMonthlyTax(0)).toBe(0);
    expect(estimateMonthlyTax(-100)).toBe(0);
    expect(estimateMonthlyTax(1000)).toBe(0);
  });

  it('taxes only the marginal amount in each bracket', () => {
    // 2000: (2000-1000) * 0.10 = 100
    expect(estimateMonthlyTax(2000)).toBe(100);
    // 4000: (4000-1000) * 0.10 = 300
    expect(estimateMonthlyTax(4000)).toBe(300);
    // 8000: 300 + (8000-4000) * 0.12 = 300 + 480 = 780
    expect(estimateMonthlyTax(8000)).toBe(780);
    // 10000: 780 + (10000-8000) * 0.22 = 780 + 440 = 1220
    expect(estimateMonthlyTax(10000)).toBe(1220);
  });

  it('is monotonically non-decreasing', () => {
    let prev = -1;
    for (let g = 0; g <= 12000; g += 250) {
      const tax = estimateMonthlyTax(g);
      expect(tax).toBeGreaterThanOrEqual(prev);
      prev = tax;
    }
  });
});

// Mirrors the employee schema in payroll.controller.ts.
const CreateEmployeeSchema = z.object({
  code: z.string().min(1).max(64),
  full_name: z.string().min(1).max(200),
  email: z.string().email().nullish(),
  base_salary: z.number().min(0),
  currency: z.string().length(3).optional(),
  hired_on: z.string().date(),
  terminated_on: z.string().date().nullish(),
});

describe('Employee DTO', () => {
  const minimal = { code: 'EMP-1', full_name: 'Ama Mensah', base_salary: 3500, hired_on: '2025-01-15' };

  it('accepts a minimal valid payload', () => {
    expect(() => CreateEmployeeSchema.parse(minimal)).not.toThrow();
  });

  it('rejects missing salary or hire date', () => {
    expect(() => CreateEmployeeSchema.parse({ code: 'X', full_name: 'Y' })).toThrow();
    expect(() => CreateEmployeeSchema.parse({ ...minimal, base_salary: -1 })).toThrow();
    expect(() => CreateEmployeeSchema.parse({ ...minimal, hired_on: '15-01-2025' })).toThrow();
  });
});
