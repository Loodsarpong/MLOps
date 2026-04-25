import { get, set, del } from 'idb-keyval';
import { api } from './api';

const QUEUE_KEY = 'pos-offline-queue';

export interface QueuedSale {
  id: string;        // client-side idempotency key
  payload: Record<string, unknown>;
  createdAt: number;
}

interface SyncResult {
  results: Array<{ key: string; ok: boolean; error?: string }>;
}

export async function enqueueSale(item: QueuedSale) {
  const list = ((await get(QUEUE_KEY)) as QueuedSale[] | undefined) ?? [];
  list.push(item);
  await set(QUEUE_KEY, list);
}

export async function listQueuedSales(): Promise<QueuedSale[]> {
  return ((await get(QUEUE_KEY)) as QueuedSale[] | undefined) ?? [];
}

export async function queuedCount(): Promise<number> {
  const list = await listQueuedSales();
  return list.length;
}

/**
 * POST every queued sale to /pos/sync as a single batch.
 * Removes successfully-recorded sales from IndexedDB; failures stay queued
 * so the next reconnect can retry them.
 */
export async function flushQueue(): Promise<{ accepted: number; rejected: number }> {
  const queue = await listQueuedSales();
  if (queue.length === 0) return { accepted: 0, rejected: 0 };

  const sales = queue.map((q) => ({
    ...(q.payload as object),
    client_idempotency_key: q.id,
  }));

  const r = await api<SyncResult>('/pos/sync', {
    method: 'POST',
    body: JSON.stringify({ sales }),
  });

  const okKeys = new Set(r.results.filter((x) => x.ok).map((x) => x.key));
  const remaining = queue.filter((q) => !okKeys.has(q.id));

  if (remaining.length) await set(QUEUE_KEY, remaining);
  else await del(QUEUE_KEY);

  return {
    accepted: okKeys.size,
    rejected: r.results.length - okKeys.size,
  };
}
