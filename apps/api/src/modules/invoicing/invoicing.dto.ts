import { z } from 'zod';

// --- Manual line entry --------------------------------------------------
//
// `product_id` is optional so accountants can bill arbitrary services
// (e.g. consulting, freight). A free-text `description` is required so
// the PDF and customer always have something to show.
export const InvoiceLineInputSchema = z.object({
  product_id: z.string().uuid().nullish(),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  tax_pct: z.number().min(0).max(100).default(0),
});
export type InvoiceLineInput = z.infer<typeof InvoiceLineInputSchema>;

// --- Create invoice ----------------------------------------------------
//
// Exactly one of:
//   - { order_id }  → reuse a confirmed sales_order's lines (line copy
//                     happens at issue time so a later product price
//                     change does not silently rewrite the customer's bill)
//   - { customer_id, lines }  → manual entry
const Base = z.object({
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
});

export const CreateInvoiceFromOrderSchema = Base.extend({
  order_id: z.string().uuid(),
});

export const CreateInvoiceManualSchema = Base.extend({
  customer_id: z.string().uuid(),
  currency: z.string().length(3).default('USD'),
  lines: z.array(InvoiceLineInputSchema).min(1).max(200),
});

export const CreateInvoiceSchema = z.union([
  CreateInvoiceFromOrderSchema.strict(),
  CreateInvoiceManualSchema.strict(),
]);

export type CreateInvoiceDto = z.infer<typeof CreateInvoiceSchema>;
export type CreateInvoiceFromOrderDto = z.infer<typeof CreateInvoiceFromOrderSchema>;
export type CreateInvoiceManualDto = z.infer<typeof CreateInvoiceManualSchema>;

export function isFromOrder(dto: CreateInvoiceDto): dto is CreateInvoiceFromOrderDto {
  return 'order_id' in dto;
}
