# Frontend Structure

Next.js 14 App Router, TypeScript, Tailwind + shadcn/ui, PWA via `next-pwa`.
State management: TanStack Query (server state) + Zustand (client/UI state).
Forms: React Hook Form + Zod. Charts: Recharts.

## 1. App layout

```
apps/web/
├── public/
│   ├── icons/            # PWA icons (192, 512, maskable)
│   ├── manifest.webmanifest
│   └── favicon.ico
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── forgot-password/page.tsx
│   │   ├── (app)/        # Authenticated shell
│   │   │   ├── layout.tsx            # Sidebar + topbar
│   │   │   ├── dashboard/page.tsx    # Role-based dashboard
│   │   │   ├── pos/
│   │   │   │   ├── page.tsx          # POS terminal
│   │   │   │   └── session/[id]/page.tsx
│   │   │   ├── sales/
│   │   │   │   ├── orders/page.tsx
│   │   │   │   └── orders/[id]/page.tsx
│   │   │   ├── invoices/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   └── recurring/page.tsx
│   │   │   ├── customers/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── suppliers/page.tsx
│   │   │   ├── products/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── inventory/
│   │   │   │   ├── stock/page.tsx
│   │   │   │   ├── warehouses/page.tsx
│   │   │   │   ├── batches/page.tsx
│   │   │   │   └── transfers/page.tsx
│   │   │   ├── procurement/
│   │   │   │   ├── orders/page.tsx
│   │   │   │   └── grn/page.tsx
│   │   │   ├── accounting/
│   │   │   │   ├── ar/page.tsx
│   │   │   │   └── ap/page.tsx
│   │   │   ├── payroll/page.tsx
│   │   │   ├── reports/
│   │   │   │   ├── sales/page.tsx
│   │   │   │   ├── inventory/page.tsx
│   │   │   │   └── aging/page.tsx
│   │   │   ├── settings/
│   │   │   │   ├── users/page.tsx
│   │   │   │   ├── roles/page.tsx
│   │   │   │   ├── integrations/quickbooks/page.tsx
│   │   │   │   └── tenant/page.tsx
│   │   │   └── notifications/page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/           # shadcn primitives (Button, Dialog, Table, ...)
│   │   ├── charts/       # Sales, Aging, Inventory charts
│   │   ├── data-table/   # Generic server-paginated table
│   │   ├── forms/        # Zod-driven form helpers
│   │   ├── pos/          # Cart, Keypad, PaymentModal, OfflineBanner
│   │   ├── layout/       # Sidebar, Topbar, CommandPalette
│   │   └── scanner/      # BarcodeScanner (getUserMedia + ZXing)
│   ├── features/         # Feature hooks (queries/mutations) per module
│   │   ├── pos/
│   │   ├── sales/
│   │   ├── invoices/
│   │   └── ...
│   ├── lib/
│   │   ├── api.ts        # fetch wrapper with JWT + idempotency keys
│   │   ├── auth.ts       # Cognito helpers
│   │   ├── rbac.ts       # <Can> guard + usePermission hook
│   │   ├── currency.ts   # multi-currency formatting
│   │   ├── offline.ts    # IndexedDB queue (idb-keyval)
│   │   └── sw.ts         # service-worker registration helpers
│   ├── stores/           # Zustand stores (cart, offlineQueue, ui)
│   ├── types/            # Re-exports from packages/shared
│   └── middleware.ts     # Edge auth redirect
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## 2. Role-based dashboards

`/dashboard` conditionally renders a layout per primary role:

| Role               | Widgets                                                         |
| ------------------ | --------------------------------------------------------------- |
| admin              | KPIs (revenue, AR, AP, cash), org map, audit feed               |
| accountant         | AR aging, AP due, cash position, QBO sync status                |
| sales_rep          | My pipeline, top customers, targets vs actuals                  |
| inventory_manager  | Low stock, expiring batches, open POs, transfers pending        |
| cashier            | Redirects to `/pos`                                             |

## 3. PWA

`next-pwa` generates `sw.js`; manifest installs the app. Strategies:

- **Cache-first** for `/_next/static/*`, icons, fonts, product images.
- **Network-first** for `/api/*` GETs with fallback to IndexedDB last-good.
- **Background-sync** queue for POS sales and stock adjustments when offline.

The POS page detects `navigator.onLine` and displays an `OfflineBanner`. The
Zustand `offlineQueue` persists to IndexedDB; on reconnect, entries are POSTed
with their original `Idempotency-Key`.

## 4. Barcode scanning

`BarcodeScanner` uses `MediaDevices.getUserMedia` + `@zxing/browser`. Works on
Android & iOS Safari 16+. Fallback input for USB scanners (keyboard-wedge) —
listens for a rapid sequence of key events terminated by Enter.

## 5. Sample page — POS terminal

```tsx
// apps/web/src/app/(app)/pos/page.tsx
"use client";

import { useState } from "react";
import { useCartStore } from "@/stores/cart";
import { BarcodeScanner } from "@/components/scanner/BarcodeScanner";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { OfflineBanner } from "@/components/pos/OfflineBanner";
import { useResolveBarcode } from "@/features/pos/useResolveBarcode";
import { Button } from "@/components/ui/Button";

export default function POSPage() {
  const cart = useCartStore();
  const resolve = useResolveBarcode();
  const [payOpen, setPayOpen] = useState(false);

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-4rem)] p-4">
      <OfflineBanner className="col-span-12" />
      <div className="col-span-8 flex flex-col gap-4">
        <BarcodeScanner
          onDetect={async (upc) => {
            const p = await resolve.mutateAsync(upc);
            cart.add(p);
          }}
        />
        <ProductGrid onPick={(p) => cart.add(p)} />
      </div>
      <aside className="col-span-4 rounded-xl bg-white shadow flex flex-col">
        <Cart />
        <footer className="p-4 border-t flex gap-2">
          <Button variant="outline" onClick={cart.clear}>Clear</Button>
          <Button className="flex-1" disabled={!cart.total} onClick={() => setPayOpen(true)}>
            Charge {cart.formattedTotal}
          </Button>
        </footer>
      </aside>
      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} />
    </div>
  );
}
```

## 6. Sample page — Dashboard (admin)

```tsx
// apps/web/src/app/(app)/dashboard/page.tsx
import { KpiCard } from "@/components/ui/KpiCard";
import { SalesTrendChart } from "@/components/charts/SalesTrendChart";
import { AgingChart } from "@/components/charts/AgingChart";
import { LowStockTable } from "@/components/inventory/LowStockTable";
import { getDashboard } from "@/features/reports/getDashboard";

export default async function Dashboard() {
  const data = await getDashboard();
  return (
    <div className="grid grid-cols-12 gap-4 p-6">
      <KpiCard className="col-span-3" label="Revenue (30d)" value={data.revenue30d} delta={data.revenueDelta} />
      <KpiCard className="col-span-3" label="Outstanding AR" value={data.arTotal} />
      <KpiCard className="col-span-3" label="Due AP" value={data.apDueNext7} />
      <KpiCard className="col-span-3" label="Low-stock SKUs" value={data.lowStockCount} />
      <section className="col-span-8 rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold mb-2">Sales trend</h2>
        <SalesTrendChart series={data.salesTrend} />
      </section>
      <section className="col-span-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold mb-2">AR aging</h2>
        <AgingChart buckets={data.aging} />
      </section>
      <section className="col-span-12 rounded-xl bg-white p-4 shadow">
        <h2 className="font-semibold mb-2">Low stock</h2>
        <LowStockTable rows={data.lowStock} />
      </section>
    </div>
  );
}
```

## 7. Sample page — Inventory stock list

```tsx
// apps/web/src/app/(app)/inventory/stock/page.tsx
"use client";
import { DataTable } from "@/components/data-table/DataTable";
import { useStockQuery } from "@/features/inventory/useStockQuery";

export default function StockPage() {
  const { data, isLoading, params, setParams } = useStockQuery();
  return (
    <DataTable
      loading={isLoading}
      rows={data?.data ?? []}
      total={data?.meta.total}
      params={params}
      onChange={setParams}
      columns={[
        { key: "sku", label: "SKU", sortable: true },
        { key: "name", label: "Product" },
        { key: "warehouse", label: "Warehouse" },
        { key: "batch_no", label: "Batch" },
        { key: "expires_on", label: "Expiry", format: "date" },
        { key: "quantity", label: "Qty", align: "right" },
        { key: "reorder_point", label: "Reorder", align: "right" },
      ]}
      filters={[
        { key: "warehouse_id", label: "Warehouse", type: "select", source: "/warehouses" },
        { key: "expiring_within_days", label: "Expiring within", type: "number" },
      ]}
      exports={["csv", "xlsx"]}
    />
  );
}
```

## 8. Sample page — Reports (Sales)

Charts: `Recharts` `<AreaChart>` for trend, `<BarChart>` for by-product.
Filter drawer for date range, warehouse, channel. Export buttons hit
`/reports/sales/daily?format=csv|xlsx|pdf` and stream the response.
