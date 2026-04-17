'use client';

import { useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
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
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api<Warehouse[]>('/warehouses').then((ws) => {
      setWarehouses(ws);
      const saved = localStorage.getItem('pos_warehouse_id');
      const defaultId = saved && ws.some((w) => w.id === saved)
        ? saved
        : ws.find((w) => w.type === 'outlet')?.id ?? ws[0]?.id ?? '';
      setWarehouseId(defaultId);
    }).catch((e) => setMsg(`Failed to load warehouses: ${e.message}`));

    api<Product[]>('/products').then(setProducts)
      .catch((e) => setMsg(`Failed to load products: ${e.message}`));
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
    if (!warehouseId) { setMsg('Pick a warehouse first.'); return; }
    setBusy(true);
    setMsg(null);
    const key = nanoid();
    const payload = {
      warehouse_id: warehouseId,
      currency: cart.currency,
      fx_rate: 1,
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
        await api('/pos/sales', {
          method: 'POST',
          body: JSON.stringify(payload),
          idempotencyKey: key,
        });
        setMsg('Sale recorded.');
      } else {
        await enqueueSale({ id: key, payload, createdAt: Date.now() });
        setMsg('Offline — sale queued. Will sync when online.');
      }
      cart.clear();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-12 gap-4 p-4">
      <section className="col-span-8 flex flex-col rounded-xl bg-white p-4 shadow">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-semibold">Products</h2>
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
          <input
            placeholder="Search SKU or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto w-64 rounded-md border px-2 py-1 text-sm"
          />
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-3 gap-3 overflow-auto">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-lg border bg-white p-3 text-left text-sm hover:bg-shea-50"
            >
              <div className="text-xs text-shea-700">{p.sku}</div>
              <div className="mt-1 line-clamp-2 font-medium">{p.name}</div>
              <div className="mt-2 font-semibold">
                {p.currency} {Number(p.base_price).toFixed(2)}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 py-10 text-center text-sm text-shea-700">
              No products match.
            </div>
          )}
        </div>
      </section>

      <aside className="col-span-4 flex flex-col rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold">Cart</h2>
        <ul className="flex-1 divide-y overflow-auto">
          {cart.lines.length === 0 && <li className="py-6 text-center text-shea-700">Empty</li>}
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
                className="text-xs text-red-600 hover:underline"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t pt-3">
          <div className="flex justify-between text-sm">
            <span>Total</span>
            <span className="font-semibold">{cart.formattedTotal}</span>
          </div>
          <div className="mt-3 flex gap-2">
            {(['cash', 'card', 'mobile_money'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex-1 rounded-md border px-2 py-1 text-xs ${
                  method === m ? 'bg-shea-700 text-white' : ''
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
          {msg && <p className="mt-2 text-xs text-shea-700">{msg}</p>}
          <button
            disabled={busy || !cart.lines.length || !warehouseId}
            onClick={charge}
            className="mt-3 w-full rounded-md bg-shea-700 py-2 text-white hover:bg-shea-900 disabled:opacity-50"
          >
            {busy ? 'Processing…' : 'Charge'}
          </button>
        </div>
      </aside>
    </div>
  );
}
