'use client';

import { Bell, Wifi, WifiOff, User } from 'lucide-react';
import { useOnline } from '@/lib/useOnline';

export function Topbar() {
  const online = useOnline();
  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4">
      <div />
      <div className="flex items-center gap-4 text-sm">
        <span className={online ? 'text-green-700' : 'text-amber-700'}>
          {online ? <Wifi className="inline h-4 w-4" /> : <WifiOff className="inline h-4 w-4" />}{' '}
          {online ? 'Online' : 'Offline — sales will sync on reconnect'}
        </span>
        <button aria-label="Notifications" className="rounded p-1 hover:bg-shea-100">
          <Bell className="h-4 w-4" />
        </button>
        <button aria-label="Account" className="rounded p-1 hover:bg-shea-100">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
