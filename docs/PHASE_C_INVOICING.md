# Phase C — Invoicing UI

> **Status:** Planned, not started. Decision locked 2026-05-08
> ([`HANDOVER.md`](HANDOVER.md) §7a.3).
> **Branch convention when work starts:** `feature/invoicing-ui` (or
> `claude/invoicing-ui-<id>` if AI-assisted).

---

## 1. Why this is Phase C

- The data model is already in place: `invoices`, `invoice_lines`,
  `payments`, `ar_transactions` (migration `0003_sales_invoicing.sql`).
- The PDF generator exists at
  `apps/api/src/modules/invoicing/invoice-pdf.service.ts`.
- The invoicing service already implements `list`, `get`, `recordPayment`,
  and `agingReport` (`apps/api/src/modules/invoicing/invoicing.service.ts`).
- Notifications + SES wiring already work (POS clerk-email proves the
  pipeline). `notification_log` deduplicates outbound mail.
- There is no `/invoices` route in the web app today.

The gap is therefore mostly UI plus three to four missing API endpoints —
the highest "unbuilt-to-shipped" conversion in the codebase.

---

## 2. Scope

### In scope

1. **List invoices** at `/invoices` with filters (status, customer, date
   range), sort by `issue_date desc`, server-paginated.
2. **Invoice detail** at `/invoices/[id]` showing header, lines, payment
   history, AR balance, status pill, action buttons.
3. **Create invoice** in two paths:
   - From a confirmed `sales_order` (one-click "Issue invoice" on the
     order detail page; reuses order lines).
   - Manual entry (line-item editor, customer picker, due date).
4. **Record payment** dialog on the invoice detail page (already wired in
   the API as `POST /invoices/:id/payments`).
5. **Download PDF** via signed S3 URL.
6. **Email invoice** to the customer (`POST /invoices/:id/send`); writes
   to `notification_log` with a stable dedupe key so retries do not
   double-send.
7. **Void invoice** (`admin` only); creates a reversing AR transaction.

### Out of scope (Phase D or later)

- Recurring invoices.
- Credit notes / partial-line refunds.
- B2B portal access for customers to pay online.
- QuickBooks Online sync (Phase D candidate — see HANDOVER §7b.2).
- Multi-currency invoicing UI (decision §7a.2 — schema dormant).
- Tax engine beyond the per-sale flag introduced in
  `0008_warehouse_clerk_and_tax.sql`.

---

## 3. API gaps to close

These endpoints are documented in [`API.md`](API.md) §9 but are **not yet
implemented**:

| Method | Path                            | Notes                                                                 |
| ------ | ------------------------------- | --------------------------------------------------------------------- |
| POST   | `/invoices`                     | Create from `order_id` *or* manual `lines[]`. Must allocate `invoice_no` from a per-tenant sequence and write an `ar_transactions` row of type `invoice`. |
| GET    | `/invoices/:id/pdf`             | 302 to a signed S3 URL. Generate-on-demand if `pdf_s3_key` is null; otherwise reuse. |
| POST   | `/invoices/:id/send`            | Idempotent SES send; insert into `notification_log` keyed on `invoice:<id>:send:<sha256(to)>`. |
| POST   | `/invoices/:id/void`            | `admin` only. Sets `status = 'void'`, writes a reversing `ar_transactions` row, audits. Refuses if any payment exists; returns RFC 7807 `{ status: 409 }`. |

Already implemented (do not duplicate):

- `GET /invoices` (list with pagination + filters)
- `GET /invoices/:id`
- `POST /invoices/:id/payments`

### Validation contracts (Zod / class-validator)

- `POST /invoices`: exactly one of `order_id` or `lines[]` must be present.
  Lines require `product_id` (or free-text `description`), `quantity > 0`,
  `unit_price >= 0`, `tax_pct ∈ [0,100]`. `due_date` defaults to
  `issue_date + customers.payment_terms_days` if omitted.
- `POST /invoices/:id/send`: `to` defaults to `customers.email`; an explicit
  `to[]` array overrides. All addresses must be in `SES_FROM_ALLOWLIST` if
  `NODE_ENV=production`.

---

## 4. Web work

New routes under `apps/web/src/app/(app)/invoices/`:

```
invoices/
├── page.tsx                # List + filters + bulk actions (export CSV, bulk send)
├── [id]/
│   ├── page.tsx            # Detail view, payment history, action buttons
│   └── payments/
│       └── page.tsx        # Optional drilldown if list grows
├── new/
│   └── page.tsx            # Manual invoice form
└── from-order/[orderId]/
    └── page.tsx            # One-click "Issue invoice from order"
```

Components to add (under `apps/web/src/components/invoices/`):

- `InvoiceStatusPill` — `draft | issued | partial | paid | overdue | void`.
- `InvoiceLineEditor` — react-hook-form array, product picker, live totals.
- `RecordPaymentDialog` — calls `POST /invoices/:id/payments`.
- `SendInvoiceDialog` — confirm recipients, button calls `POST /:id/send`.
- `VoidInvoiceDialog` — admin-only confirmation with reason field.

State / data layer:

- TanStack Query hooks in `apps/web/src/features/invoices/` (`useInvoices`,
  `useInvoice`, `useCreateInvoice`, `useRecordPayment`, `useSendInvoice`,
  `useVoidInvoice`).
- Toasts via `sonner` for every mutation, success and error.
- All mutating calls send an `Idempotency-Key` (nanoid) — the server's
  `IdempotencyInterceptor` already dedupes.

Sidebar nav: add an "Invoices" entry to
`apps/web/src/components/layout/Sidebar.tsx` (or wherever the active-nav
landed) gated on `invoices:read`.

---

## 5. DB migrations

**No new migration is required for the happy path.** The existing
`invoices` and `invoice_lines` tables (migration `0003_sales_invoicing.sql`)
already cover the scope above.

Optional, only if useful during build:

- `invoice_sequences` table for per-tenant `invoice_no` allocation if you
  want to avoid race conditions on `MAX(invoice_no) + 1`. Postgres sequences
  per tenant are also fine; pick one and stay consistent.

If you do add a migration, name it `0011_<short_summary>.sql` and remember
the project rule: never edit a merged migration; add a new one.

---

## 6. Suggested sequence (5 working days)

| Day | Work                                                                                         |
| --- | -------------------------------------------------------------------------------------------- |
| 1   | API: add `POST /invoices` (manual + from-order) with `class-validator` DTO + unit tests. Hook into `AuditService`. |
| 2   | API: add `GET /invoices/:id/pdf` (presigned URL) and `POST /invoices/:id/send` (SES + notification_log idempotency). |
| 3   | Web: list + detail + status pill + record-payment dialog. Wire the existing `GET /invoices` and `POST /:id/payments`. |
| 4   | Web: new-invoice form + from-order shortcut + send + download PDF actions. Smoke-test the full happy path locally. |
| 5   | API + web: `void` flow + admin gating. Add at least one unit test per new API endpoint. Update `API.md` to remove the "not yet implemented" note from §9. |

Each day ends with a green `make test` and `make lint`.

---

## 7. Acceptance checklist

Tick each before declaring Phase C done:

- [ ] An accountant can create an invoice from a confirmed sales order in
      ≤3 clicks and see the PDF inline.
- [ ] An accountant can record a partial payment and the invoice status
      flips `issued → partial` automatically.
- [ ] Recording the final payment flips status to `paid` and the invoice
      drops out of the AR aging report.
- [ ] Sending the same invoice twice (e.g., a second click) only emails the
      customer once (verified via `notification_log` row count).
- [ ] An admin can void a payment-free invoice and the `ar_transactions`
      ledger zeroes out for that customer.
- [ ] A `sales_rep` cannot see the void button.
- [ ] All new endpoints have at least one happy-path vitest spec.
- [ ] `API.md` §9 no longer carries any "TBD" markers.

---

## 8. Risks and known sharp edges

1. **PDF generation is synchronous today.** `invoice-pdf.service.ts` runs
   inline. For a single-tenant US business this is fine, but if generation
   creeps over ~500 ms, push it onto BullMQ rather than blocking the request.
2. **SES sandbox.** If the AWS account is still in SES sandbox, `POST
   /:id/send` will fail for any address outside the verified set. Confirm
   sandbox status before rollout — there is no automated probe for this.
3. **Email From-address allowlist.** `SES_FROM_ALLOWLIST` is a real list of
   real people's addresses. The sender resolution rule (cashier-wins-over-
   default) is implemented in the notifications service — reuse it; do not
   reinvent.
4. **Order → Invoice line copying.** Make sure copying lines preserves
   `tax_pct` and `unit_price` from the order at the moment of issue. Do
   not re-derive them from `products.base_price` at invoice time, otherwise
   a price change between order confirmation and invoice issue will
   silently change the customer's bill.
5. **Voiding a partially-paid invoice.** Out of scope — return 409. If the
   business needs it, do it in Phase C.1 with explicit credit-note semantics.

---

*Author: handover pass, 2026-05-08. Update this file as Phase C ships.*
