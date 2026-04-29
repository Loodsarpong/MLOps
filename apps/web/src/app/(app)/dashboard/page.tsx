'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface SalesPoint { day: string; total: number; order_count: number }
interface AgingRow { code: string; name: string; bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number; total_due: number }

export default function DashboardPage() {
  const [sales, setSales] = useState<SalesPoint[] | null>(null);
  const [aging, setAging] = useState<AgingRow[] | null>(null);
  const [lowStock, setLowStock] = useState<number | null>(null);

  useEffect(() => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    api<SalesPoint[]>(`/reports/sales/daily?from=${from}&to=${to}`)
      .then(setSales)
      .catch((e) => { setSales([]); toast.error('Sales report failed', { description: e.message }); });
    api<AgingRow[]>('/reports/ar/aging')
      .then((r) => setAging(r.slice(0, 5)))
      .catch((e) => { setAging([]); toast.error('AR aging failed', { description: e.message }); });
    api<unknown[]>('/inventory/low-stock')
      .then((r) => setLowStock(r.length))
      .catch((e) => { setLowStock(0); toast.error('Low-stock check failed', { description: e.message }); });
  }, []);

  const revenue30d = (sales ?? []).reduce((a, p) => a + Number(p.total ?? 0), 0);
  const arTotal = (aging ?? []).reduce((a, r) => a + Number(r.total_due ?? 0), 0);

  return (
    <div className="grid grid-cols-12 gap-4 p-6">
      <KpiCard className="col-span-3" label="Revenue (30d)"
        value={sales === null ? null : `GHS ${revenue30d.toFixed(2)}`} />
      <KpiCard className="col-span-3" label="Outstanding AR"
        value={aging === null ? null : `GHS ${arTotal.toFixed(2)}`} />
      <KpiCard className="col-span-3" label="Low-stock SKUs"
        value={lowStock === null ? null : String(lowStock)} />
      <KpiCard className="col-span-3" label="Open POs" value="—" />

      <section className="col-span-8 rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold">Sales trend (30d)</h2>
        {sales === null ? (
          <ChartSkeleton height={260} />
        ) : sales.length === 0 ? (
          <EmptyChart label="No sales recorded yet." height={260} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={sales}>
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Area dataKey="total" stroke="#8a6128" fill="#f9ecd3" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="col-span-4 rounded-xl bg-white p-4 shadow">
        <h2 className="mb-3 font-semibold">AR aging (top 5)</h2>
        {aging === null ? (
          <ChartSkeleton height={260} />
        ) : aging.length === 0 ? (
          <EmptyChart label="No outstanding receivables." height={260} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={aging}>
              <XAxis dataKey="code" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="bucket_0_30" stackId="a" fill="#c89a4b" name="0-30" />
              <Bar dataKey="bucket_31_60" stackId="a" fill="#8a6128" name="31-60" />
              <Bar dataKey="bucket_61_90" stackId="a" fill="#4a321b" name="61-90" />
              <Bar dataKey="bucket_90_plus" stackId="a" fill="#b45309" name="90+" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value, className = '' }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={`rounded-xl bg-white p-4 shadow ${className}`}>
      <div className="text-xs uppercase tracking-wide text-shea-700">{label}</div>
      {value === null ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-shea-100" />
      ) : (
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      )}
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded bg-shea-50" style={{ height }} />;
}

function EmptyChart({ label, height }: { label: string; height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded bg-shea-50 text-sm text-shea-700"
      style={{ height }}
    >
      {label}
    </div>
  );
}
