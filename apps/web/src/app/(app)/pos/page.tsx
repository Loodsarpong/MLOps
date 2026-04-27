'use client';

import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Search, Trash2, ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/stores/cart';
import { useOnline } from '@/lib/useOnline';
import { api } from '@/lib/api';
import { enqueueSale } from '@/lib/offline';

interface Warehouse { id: string; code: string; name: string; type: string; }
interface Product {
  id: string; sku: string; upc: string | null; name: string;
  category: string | null; uom: string;
  tax_rate_pct: string; base_price: string; currency: string;
}

export default function POSPage() {
  const cart = useCartStore();
  const online = useOnline();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [method, setMethod] = useState<'cash' | 'card' | 'mobile_money'>('cash');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Warehouse[]>('/warehouses').then((ws) => {
        setWarehouses(ws);
        const saved = localStorage.getItem('pos_warehouse_id');
        // Single-warehouse deployments: always auto-select the only one.
        const defaultId = ws.length === 1
          ? ws[0]?.id ?? ''
          : saved && ws.some((w) => w.id === saved)
            ? saved
            : ws.find((w) => w.type === 'outlet')?.id ?? ws[0]?.id ?? '';
        setWarehouseId(defaultId);
      }).catch((e) => toast.error('Failed to load warehouses', { description: e.message })),
      api<Product[]>('/products').then(setProducts)
        .catch((e) => toast.error('Failed to load products', { description: e.message })),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (warehouseId) localStorage.setItem('pos_warehouse_id', warehouseId);
  }, [warehouseId]);

  const filtered = products.filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()),
  );

  const addToCart = (p: Product) => {
    cart.add({
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      unit_price: Number(p.base_price),
      tax_pct: Number(p.tax_rate_pct),
    });
  };

  const charge = async () => {
    if (!cart.lines.length) return;
    if (!warehouseId) { toast.warning('Pick a warehouse first.'); return; }
    setBusy(true);
    const key = nanoid();
    const payload = {
      warehouse_id: warehouseId,
      currency: cart.currency,
      fx_rate: 1,
      apply_tax: cart.applyTax,
      items: cart.lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_pct: l.tax_pct,
      })),
      payment: { method, amount: cart.total },
    };
    try {
      if (online) {
        const r = await api<{ order_no: string; invoice: { invoice_no: string } }>(
          '/pos/sales',
          { method: 'POST', body: JSON.stringify(payload), idempotencyKey: key },
        );
        toast.success('Sale recorded', { description: `${r.order_no} · ${r.invoice.invoice_no}` });
      } else {
        await enqueueSale({ id: key, payload, createdAt: Date.now() });
        window.dispatchEvent(new Event('pos-queue-changed'));
        toast.info('Offline — sale queued', { description: 'Will sync when online.' });
      }
      cart.clear();
    } catch (e) {
      toast.error('Charge failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-12 gap-4 p-4">
      <section className="col-span-8 flex flex-col rounded-xl bg-white p-4 shadow">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-semibold">Products</h2>
          {warehouses.length === 1 ? (
            <span className="rounded-md bg-shea-50 px-2 py-1 text-xs text-shea-700">
              {warehouses[0]?.name}
            </span>
          ) : (
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="rounded-md border px-2 py-1 text-sm"
            >
              <option value="" disabled>Select warehouse…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
              ))}
            </select>
          )}
          <div className="relative ml-auto w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-shea-700" />
            <input
              placeholder="Search SKU or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border py-1 pl-8 pr-2 text-sm"
            />
          </div>
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-3 gap-3 overflow-auto">
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-shea-50" />
          ))}
          {!loading && filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-lg border bg-white p-3 text-left text-sm transition hover:border-shea-700 hover:bg-shea-50"
            >
              <div className="text-xs text-shea-700">{p.sku}</div>
              <div className="mt-1 line-clamp-2 font-medium">{p.name}</div>
              <div className="mt-2 font-semibold">
                {p.currency} {Number(p.base_price).toFixed(2)}
              </div>
            </button>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="col-span-3 flex flex-col items-center justify-center py-16 text-sm text-shea-700">
              <Search className="mb-2 h-8 w-8 text-shea-300" />
              {search ? `No products match "${search}".` : 'No products available.'}
            </div>
          )}
        </div>
      </section>

      <aside className="col-span-4 flex flex-col rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold">Cart</h2>
        <ul className="flex-1 divide-y overflow-auto">
          {cart.lines.length === 0 && (
            <li className="flex flex-col items-center justify-center py-12 text-sm text-shea-700">
              <ShoppingBag className="mb-2 h-8 w-8 text-shea-300" />
              Cart is empty
              <span className="mt-1 text-xs">Tap a product to add it</span>
            </li>
          )}
          {cart.lines.map((l) => (
            <li key={l.product_id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.name}</div>
                <div className="text-xs text-shea-700">{l.sku}</div>
              </div>
              <input
                type="number"
                min={0}
                value={l.quantity}
                onChange={(e) => cart.update(l.product_id, parseInt(e.target.value, 10) || 0)}
                className="w-14 rounded border px-2 py-1 text-right"
              />
              <span className="w-20 text-right">
                {(l.unit_price * l.quantity).toFixed(2)}
              </span>
              <button
                onClick={() => cart.remove(l.product_id)}
                aria-label="Remove line"
                className="rounded p-1 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t pt-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: cart.currency }).format(cart.subtotal)}</span>
            </div>
            <label className="flex cursor-pointer items-center justify-between">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cart.applyTax}
                  onChange={(e) => cart.setApplyTax(e.target.checked)}
                  className="h-4 w-4"
                />
                Sales tax ({cart.taxRatePct.toFixed(2)}%)
              </span>
              <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: cart.currency }).format(cart.tax)}</span>
            </label>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span>{cart.formattedTotal}</span>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {(['cash', 'card', 'mobile_money'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex-1 rounded-md border px-2 py-1 text-xs capitalize transition ${
                  method === m ? 'bg-shea-700 text-white' : 'hover:bg-shea-50'
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
          <button
            disabled={busy || !cart.lines.length || !warehouseId}
            onClick={charge}
            className="mt-3 w-full rounded-md bg-shea-700 py-2 text-white transition hover:bg-shea-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Processing…' : `Charge ${cart.formattedTotal}`}
          </button>
        </div>
      </aside>
    </div>
  );
}
