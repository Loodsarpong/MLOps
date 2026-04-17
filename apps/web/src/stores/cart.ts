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
  add: (p: Omit<CartLine, 'quantity'> & { quantity?: number }) => void;
  update: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

function compute(lines: CartLine[]) {
  const subtotal = lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0);
  const tax = lines.reduce((acc, l) => acc + (l.unit_price * l.quantity * l.tax_pct) / 100, 0);
  return +(subtotal + tax).toFixed(2);
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  total: 0,
  formattedTotal: 'GHS 0.00',
  currency: 'GHS',
  add: (p) =>
    set((s) => {
      const existing = s.lines.find((l) => l.product_id === p.product_id);
      const lines = existing
        ? s.lines.map((l) =>
            l.product_id === p.product_id ? { ...l, quantity: l.quantity + (p.quantity ?? 1) } : l,
          )
        : [...s.lines, { ...p, quantity: p.quantity ?? 1 }];
      const total = compute(lines);
      return { lines, total, formattedTotal: `${s.currency} ${total.toFixed(2)}` };
    }),
  update: (productId, qty) =>
    set((s) => {
      const lines = s.lines
        .map((l) => (l.product_id === productId ? { ...l, quantity: qty } : l))
        .filter((l) => l.quantity > 0);
      const total = compute(lines);
      return { lines, total, formattedTotal: `${s.currency} ${total.toFixed(2)}` };
    }),
  remove: (productId) =>
    set((s) => {
      const lines = s.lines.filter((l) => l.product_id !== productId);
      const total = compute(lines);
      return { lines, total, formattedTotal: `${s.currency} ${total.toFixed(2)}` };
    }),
  clear: () => set(() => ({ lines: [], total: 0, formattedTotal: 'GHS 0.00' })),
}));
