'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Package, Warehouse, Truck,
  Users2, Building2, LineChart, Settings,
} from 'lucide-react';
import clsx from 'clsx';

const nav = [
  { href: '/dashboard',          label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/pos',                label: 'POS',         icon: ShoppingCart },
  { href: '/sales/orders',       label: 'Sales',       icon: ShoppingCart },
  { href: '/invoices',           label: 'Invoices',    icon: ReceiptText },
  { href: '/customers',          label: 'Customers',   icon: Users2 },
  { href: '/products',           label: 'Products',    icon: Package },
  { href: '/inventory/stock',    label: 'Inventory',   icon: Warehouse },
  { href: '/procurement/orders', label: 'Procurement', icon: Truck },
  { href: '/suppliers',          label: 'Suppliers',   icon: Building2 },
  { href: '/reports/sales',      label: 'Reports',     icon: LineChart },
  { href: '/settings/tenant',    label: 'Settings',    icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 border-r bg-white">
      <div className="flex items-center gap-2 p-4 text-lg font-semibold text-shea-900">
        <div className="h-7 w-7 rounded-md bg-shea-700" aria-hidden />
        NaturalShea
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href as never}
              className={clsx(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-shea-700 text-white'
                  : 'text-shea-900 hover:bg-shea-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
