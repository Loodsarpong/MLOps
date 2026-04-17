'use client';

import { useState } from 'react';
import { nanoid } from 'nanoid';
import { useCartStore } from '@/stores/cart';
import { useOnline } from '@/lib/useOnline';
import { api } from '@/lib/api';
import { enqueueSale } from '@/lib/offline';

export default function POSPage() {
  const cart = useCartStore();
  const online = useOnline();
  const [method, setMethod] = useState<'cash' | 'card' | 'mobile_money'>('cash');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const charge = async () => {
    if (!cart.lines.length) return;
    setBusy(true);
    setMsg(null);
    const key = nanoid();
    const payload = {
      session_id: localStorage.getItem('pos_session_id') ?? '',
      warehouse_id: localStorage.getItem('pos_warehouse_id') ?? '',
      currency: cart.currency,
      items: cart.lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_pct: l.tax_pct,
      })),
      payment: { method },
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
      <section className="col-span-8 rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold">Products</h2>
        <p className="text-sm text-shea-700">
          Scan a barcode or tap a product tile to add it to the cart.
        </p>
        {/* BarcodeScanner + product grid omitted for brevity */}
      </section>

      <aside className="col-span-4 flex flex-col rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold">Cart</h2>
        <ul className="flex-1 divide-y overflow-auto">
          {cart.lines.length === 0 && <li className="py-6 text-center text-shea-700">Empty</li>}
          {cart.lines.map((l) => (
            <li key={l.product_id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-shea-700">{l.sku}</div>
              </div>
              <input
                type="number"
                min={0}
                value={l.quantity}
                onChange={(e) => cart.update(l.product_id, parseInt(e.target.value, 10) || 0)}
                className="w-16 rounded border px-2 py-1 text-right"
              />
              <span className="w-20 text-right">
                {(l.unit_price * l.quantity).toFixed(2)}
              </span>
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
            disabled={busy || !cart.lines.length}
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
