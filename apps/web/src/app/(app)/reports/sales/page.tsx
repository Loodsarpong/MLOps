'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Point { day: string; total: number; order_count: number }

export default function SalesReportPage() {
  const [data, setData] = useState<Point[]>([]);
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    api<Point[]>(`/reports/sales/daily?from=${from}&to=${to}`).then(setData).catch(() => {});
  }, [from, to]);

  const exportCsv = () => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/reports/sales/daily?from=${from}&to=${to}&format=csv`);
  };

  return (
    <div className="p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Sales report</h1>
          <div className="mt-2 flex gap-2 text-sm">
            <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 rounded border px-2 py-1" /></label>
            <label>To   <input type="date" value={to}   onChange={(e) => setTo(e.target.value)}   className="ml-1 rounded border px-2 py-1" /></label>
          </div>
        </div>
        <button onClick={exportCsv} className="rounded-md bg-shea-700 px-3 py-2 text-sm text-white">Export CSV</button>
      </div>
      <div className="mt-6 rounded-xl bg-white p-4 shadow">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="total" stroke="#8a6128" />
            <Line type="monotone" dataKey="order_count" stroke="#c89a4b" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
