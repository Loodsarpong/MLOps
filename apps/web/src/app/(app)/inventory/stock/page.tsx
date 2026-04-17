'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Row {
  id: string; sku: string; name: string; warehouse_code: string; warehouse_name: string;
  batch_no: string | null; expires_on: string | null; quantity: string; reorder_point: string | null;
}

export default function StockPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouse, setWarehouse] = useState<string>('');

  useEffect(() => {
    const q = warehouse ? `?warehouse_id=${warehouse}` : '';
    api<Row[]>(`/inventory/stock${q}`).then(setRows).catch(() => {});
  }, [warehouse]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Inventory — Stock on hand</h1>
      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow">
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
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3 font-mono">{r.sku}</td>
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.warehouse_name}</td>
                <td className="p-3">{r.batch_no ?? '—'}</td>
                <td className="p-3">{r.expires_on ?? '—'}</td>
                <td className="p-3 text-right">{Number(r.quantity).toFixed(2)}</td>
                <td className="p-3 text-right">{r.reorder_point ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
