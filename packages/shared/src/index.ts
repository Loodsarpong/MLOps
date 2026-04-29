/**
 * Shared types & zod schemas used by both the API and the web app.
 * Keep this file free of runtime dependencies beyond `zod`.
 */

import { z } from 'zod';

export const Currency = z.enum(['USD', 'EUR', 'GBP', 'GHS', 'NGN']);
export type Currency = z.infer<typeof Currency>;

export const CustomerSegment = z.enum(['retail', 'wholesale', 'distributor', 'online']);
export type CustomerSegment = z.infer<typeof CustomerSegment>;

export const InvoiceStatus = z.enum(['draft', 'issued', 'partial', 'paid', 'overdue', 'void']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const PaymentMethod = z.enum(['cash', 'card', 'mobile_money', 'bank_transfer', 'cheque', 'credit']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const OrderStatus = z.enum(['draft', 'confirmed', 'picked', 'shipped', 'delivered', 'cancelled', 'returned']);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const PoStatus = z.enum(['draft', 'approved', 'sent', 'partial', 'received', 'closed', 'cancelled']);
export type PoStatus = z.infer<typeof PoStatus>;

export const Role = z.enum(['admin', 'accountant', 'sales_rep', 'inventory_manager', 'cashier', 'viewer']);
export type Role = z.infer<typeof Role>;

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: { field: string; message: string }[];
}
