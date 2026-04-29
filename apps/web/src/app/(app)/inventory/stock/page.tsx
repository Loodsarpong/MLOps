'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Package } from 'lucide-react';
import { api } from '@/lib/api';

interface Row {
  id: string; sku: string; name: string; warehouse_code: string; warehouse_name: string;
  batch_no: string | null; expires_on: string | null; quantity: string; reorder_point: string | null;
}

export default function StockPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [warehouse, setWarehouse] = useState<string>('');

  useEffect(() => {
    setRows(null);
    const q = warehouse ? `?warehouse_id=${warehouse}` : '';
    api<Row[]>(`/inventory/stock${q}`)
      .then(setRows)
      .catch((e) => { setRows([]); toast.error('Failed to load stock', { description: e.message }); });
  }, [warehouse]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory — Stock on hand</h1>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="border-b bg-shea-50">
            <tr>
              <th className="p-3 text-left">SKU</th>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Warehouse</th>
              <th className="p-3 text-left">Batch</th>
              <th className="p-3 text-left">Expires</th>
              <th className="p-3 text-right">Quantity</th>
              <th className="p-3 text-right">Reorder</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b last:border-0">
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className="p-3"><div className="h-4 animate-pulse rounded bg-shea-50" /></td>
                ))}
              </tr>
            ))}
            {rows?.map((r) => {
              const qty = Number(r.quantity);
              const reorder = r.reorder_point ? Number(r.reorder_point) : null;
              const low = reorder !== null && qty <= reorder;
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-shea-50/50">
                  <td className="p-3 font-mono">{r.sku}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3">{r.warehouse_name}</td>
                  <td className="p-3">{r.batch_no ?? '—'}</td>
                  <td className="p-3">{r.expires_on ?? '—'}</td>
                  <td className={`p-3 text-right ${low ? 'font-semibold text-amber-700' : ''}`}>
                    {qty.toFixed(2)}
                  </td>
                  <td className="p-3 text-right">{r.reorder_point ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-sm text-shea-700">
            <Package className="mb-2 h-8 w-8 text-shea-300" />
            No stock to display.
          </div>
        )}
      </div>
    </div>
  );
}
