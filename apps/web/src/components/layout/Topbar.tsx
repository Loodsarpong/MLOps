'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Wifi, WifiOff, User, LogOut, RefreshCw } from 'lucide-react';
import { useOnline } from '@/lib/useOnline';
import { useOfflineSync } from '@/lib/useOfflineSync';
import { signOut } from '@/lib/auth';

export function Topbar() {
  const online = useOnline();
  const { pending } = useOfflineSync();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const token = localStorage.getItem('jwt');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
        setEmail(payload.email ?? null);
      }
    } catch {
      /* ignore malformed token */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleSignOut = () => {
    signOut();
    router.push('/login');
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4">
      <div />
      <div className="flex items-center gap-3 text-sm">
        {pending > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-shea-100 px-2 py-0.5 text-xs text-shea-900"
            title="Sales queued offline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {pending} pending sync
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
            online
              ? 'bg-green-50 text-green-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {online ? 'Online' : 'Offline'}
        </span>
        <button aria-label="Notifications" className="rounded p-1 hover:bg-shea-100">
          <Bell className="h-4 w-4" />
        </button>
        <div ref={menuRef} className="relative">
          <button
            aria-label="Account"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded p-1 hover:bg-shea-100"
          >
            <User className="h-4 w-4" />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-md border bg-white shadow-lg">
              {email && (
                <div className="border-b px-3 py-2 text-xs text-shea-700">
                  Signed in as
                  <div className="truncate font-medium text-shea-900">{email}</div>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-shea-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
