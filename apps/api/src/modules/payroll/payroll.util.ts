/**
 * Simplified progressive monthly income-tax estimate (USD).
 *
 * This is a deterministic stand-in for a real tax engine — brackets are
 * marginal and applied to gross monthly pay. Kept as a pure function so it can
 * be unit-tested without the NestJS container.
 */
const MONTHLY_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 1000, rate: 0 },
  { upTo: 4000, rate: 0.1 },
  { upTo: 8000, rate: 0.12 },
  { upTo: Infinity, rate: 0.22 },
];

export function estimateMonthlyTax(gross: number): number {
  if (gross <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const bracket of MONTHLY_BRACKETS) {
    if (gross <= lower) break;
    const taxableInBracket = Math.min(gross, bracket.upTo) - lower;
    tax += taxableInBracket * bracket.rate;
    lower = bracket.upTo;
  }
  return +tax.toFixed(2);
}
