import { z } from 'zod';

export const PosSaleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  tax_pct: z.number().min(0).max(100).default(0),
  discount_pct: z.number().min(0).max(100).default(0),
  batch_id: z.string().uuid().optional(),
});

export const PosSaleSchema = z.object({
  session_id: z.string().uuid().optional(),
  warehouse_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  currency: z.string().length(3).default('USD'),
  fx_rate: z.number().positive().default(1),
  discount_total: z.number().nonnegative().default(0),
  // Apply tenant default sales tax to the order subtotal. Default ON;
  // cashiers can disable per sale (e.g. tax-exempt customer).
  apply_tax: z.boolean().default(true),
  items: z.array(PosSaleItemSchema).min(1),
  payment: z.object({
    method: z.enum(['cash', 'card', 'mobile_money', 'bank_transfer', 'cheque', 'credit']),
    reference: z.string().optional(),
    amount: z.number().positive().optional(), // allow partial
  }),
  offline_created_at: z.string().datetime().optional(),
});

export type PosSaleDto = z.infer<typeof PosSaleSchema>;

export const PosSyncSchema = z.object({
  sales: z.array(PosSaleSchema.extend({ client_idempotency_key: z.string().min(8) })).max(500),
});
