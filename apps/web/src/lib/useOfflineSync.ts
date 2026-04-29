'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { flushQueue, queuedCount } from './offline';

/**
 * Watches navigator.onLine and IDB queue size. Flushes queued sales to
 * /pos/sync whenever the browser regains connectivity, and exposes the
 * pending-sync count so the Topbar can show a badge.
 */
export function useOfflineSync(): { pending: number } {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const n = await queuedCount();
      if (!cancelled) setPending(n);
    };

    const flush = async () => {
      const before = await queuedCount();
      if (before === 0) return;
      try {
        const { accepted, rejected } = await flushQueue();
        if (accepted) toast.success(`Synced ${accepted} offline sale${accepted === 1 ? '' : 's'}`);
        if (rejected) toast.error(`${rejected} offline sale${rejected === 1 ? '' : 's'} failed to sync`);
      } catch (e) {
        toast.error('Sync failed', { description: (e as Error).message });
      } finally {
        await refresh();
      }
    };

    refresh();
    if (typeof navigator !== 'undefined' && navigator.onLine) flush();

    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    window.addEventListener('pos-queue-changed', refresh);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pos-queue-changed', refresh);
    };
  }, []);

  return { pending };
}
