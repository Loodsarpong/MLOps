import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
  userId: string;
  roles: string[];
  ip?: string;
  userAgent?: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function currentTenant(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) throw new Error('Tenant context not set');
  return ctx;
}
