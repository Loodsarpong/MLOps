import { get, set, del } from 'idb-keyval';

const QUEUE_KEY = 'pos-offline-queue';

export interface QueuedSale {
  id: string; // idempotency key
  payload: unknown;
  createdAt: number;
}

export async function enqueueSale(item: QueuedSale) {
  const list = ((await get(QUEUE_KEY)) as QueuedSale[] | undefined) ?? [];
  list.push(item);
  await set(QUEUE_KEY, list);
}

export async function listQueuedSales(): Promise<QueuedSale[]> {
  return ((await get(QUEUE_KEY)) as QueuedSale[] | undefined) ?? [];
}

export async function drainQueuedSales(sender: (s: QueuedSale) => Promise<void>) {
  const list = await listQueuedSales();
  const remaining: QueuedSale[] = [];
  for (const s of list) {
    try {
      await sender(s);
    } catch {
      remaining.push(s);
    }
  }
  if (remaining.length) await set(QUEUE_KEY, remaining);
  else await del(QUEUE_KEY);
}
