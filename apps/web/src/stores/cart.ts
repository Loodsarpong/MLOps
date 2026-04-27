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
  total: number;
  formattedTotal: string;
  currency: string;
  applyTax: boolean;
  setApplyTax: (v: boolean) => void;
  add: (p: Omit<CartLine, 'quantity'> & { quantity?: number }) => void;
  update: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const fmt = (currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency });

function computeTotals(lines: CartLine[], applyTax: boolean) {
  const subtotal = lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0);
  const tax = applyTax
    ? lines.reduce((acc, l) => acc + (l.unit_price * l.quantity * l.tax_pct) / 100, 0)
    : 0;
  return { subtotal: +subtotal.toFixed(2), tax: +tax.toFixed(2), total: +(subtotal + tax).toFixed(2) };
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  total: 0,
  formattedTotal: fmt('USD').format(0),
  currency: 'USD',
  applyTax: true,
  setApplyTax: (v) =>
    set((s) => {
      const { total } = computeTotals(s.lines, v);
      return { applyTax: v, total, formattedTotal: fmt(s.currency).format(total) };
    }),
  add: (p) =>
    set((s) => {
      const existing = s.lines.find((l) => l.product_id === p.product_id);
      const lines = existing
        ? s.lines.map((l) =>
            l.product_id === p.product_id ? { ...l, quantity: l.quantity + (p.quantity ?? 1) } : l,
          )
        : [...s.lines, { ...p, quantity: p.quantity ?? 1 }];
      const { total } = computeTotals(lines, s.applyTax);
      return { lines, total, formattedTotal: fmt(s.currency).format(total) };
    }),
  update: (productId, qty) =>
    set((s) => {
      const lines = s.lines
        .map((l) => (l.product_id === productId ? { ...l, quantity: qty } : l))
        .filter((l) => l.quantity > 0);
      const { total } = computeTotals(lines, s.applyTax);
      return { lines, total, formattedTotal: fmt(s.currency).format(total) };
    }),
  remove: (productId) =>
    set((s) => {
      const lines = s.lines.filter((l) => l.product_id !== productId);
      const { total } = computeTotals(lines, s.applyTax);
      return { lines, total, formattedTotal: fmt(s.currency).format(total) };
    }),
  clear: () =>
    set((s) => ({ lines: [], total: 0, formattedTotal: fmt(s.currency).format(0) })),
}));
