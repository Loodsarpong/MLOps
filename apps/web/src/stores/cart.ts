import { create } from 'zustand';

export interface CartLine {
  product_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_pct: number;
}

interface CartState {
  lines: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  formattedTotal: string;
  currency: string;
  taxRatePct: number;
  applyTax: boolean;
  setTaxRate: (rate: number) => void;
  setApplyTax: (v: boolean) => void;
  add: (p: Omit<CartLine, 'quantity'> & { quantity?: number }) => void;
  update: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const fmt = (currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency });

function computeTotals(lines: CartLine[], applyTax: boolean, ratePct: number) {
  const subtotal = lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0);
  const tax = applyTax ? (subtotal * ratePct) / 100 : 0;
  return {
    subtotal: +subtotal.toFixed(2),
    tax: +tax.toFixed(2),
    total: +(subtotal + tax).toFixed(2),
  };
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  subtotal: 0,
  tax: 0,
  total: 0,
  formattedTotal: fmt('USD').format(0),
  currency: 'USD',
  // Rate-of-record for the tenant. Authoritative computation happens server-side
  // using tenants.default_tax_rate_pct; this is just a preview default.
  taxRatePct: 7.8,
  applyTax: true,
  setTaxRate: (rate) =>
    set((s) => {
      const totals = computeTotals(s.lines, s.applyTax, rate);
      return { taxRatePct: rate, ...totals, formattedTotal: fmt(s.currency).format(totals.total) };
    }),
  setApplyTax: (v) =>
    set((s) => {
      const totals = computeTotals(s.lines, v, s.taxRatePct);
      return { applyTax: v, ...totals, formattedTotal: fmt(s.currency).format(totals.total) };
    }),
  add: (p) =>
    set((s) => {
      const existing = s.lines.find((l) => l.product_id === p.product_id);
      const lines = existing
        ? s.lines.map((l) =>
            l.product_id === p.product_id ? { ...l, quantity: l.quantity + (p.quantity ?? 1) } : l,
          )
        : [...s.lines, { ...p, quantity: p.quantity ?? 1 }];
      const totals = computeTotals(lines, s.applyTax, s.taxRatePct);
      return { lines, ...totals, formattedTotal: fmt(s.currency).format(totals.total) };
    }),
  update: (productId, qty) =>
    set((s) => {
      const lines = s.lines
        .map((l) => (l.product_id === productId ? { ...l, quantity: qty } : l))
        .filter((l) => l.quantity > 0);
      const totals = computeTotals(lines, s.applyTax, s.taxRatePct);
      return { lines, ...totals, formattedTotal: fmt(s.currency).format(totals.total) };
    }),
  remove: (productId) =>
    set((s) => {
      const lines = s.lines.filter((l) => l.product_id !== productId);
      const totals = computeTotals(lines, s.applyTax, s.taxRatePct);
      return { lines, ...totals, formattedTotal: fmt(s.currency).format(totals.total) };
    }),
  clear: () =>
    set((s) => ({ lines: [], subtotal: 0, tax: 0, total: 0, formattedTotal: fmt(s.currency).format(0) })),
}));
