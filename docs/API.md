# REST API Reference

Base URL: `https://api.naturalshea.care/v1`
Auth: `Authorization: Bearer <JWT>` (issued by AWS Cognito in prod, or the
local `/auth/login` endpoint in dev — see §1).
All mutating requests accept an `Idempotency-Key` header.

## Conventions

- JSON only (`Content-Type: application/json`).
- Tenant is derived from the JWT (`custom:tenant_id`). No `tenant_id` in URL.
- Pagination: `?page=1&limit=50` → `{ data, meta: { total, page, limit } }`.
- Filtering: `?filter[status]=paid&filter[customer_id]=...`.
- Sorting: `?sort=-issue_date`.
- Errors follow RFC 7807:

  ```json
  { "type":"https://naturalshea.care/errors/validation",
    "title":"Validation failed",
    "status":422, "errors":[{ "field":"unit_price", "message":"must be >= 0" }] }
  ```

## 1. Authentication

| Method | Path                    | Description                                        |
| ------ | ----------------------- | -------------------------------------------------- |
| POST   | `/auth/login`           | Email + password (argon2id) → JWT (Phase A)        |
| POST   | `/auth/change-password` | Force-change after admin-set or self-service       |
| POST   | `/auth/refresh`         | Rotate JWT                                         |
| POST   | `/auth/logout`          | Revoke refresh token                               |
| GET    | `/auth/me`              | Current user, roles, tenant                        |

**Auth modes.**

- **Local password auth (Phase A — current default).** Implemented in
  `apps/api/src/modules/auth/`. Passwords stored as argon2id hashes in
  `users.password_hash`, with a 5-strike lockout
  (`failed_login_count` / `locked_until`) and a `must_change_password` flag
  that admins set when issuing temporary passwords. The login response
  includes `must_change_password` so the web app can route to
  `/change-password` before letting the session reach the dashboard.
- **Cognito JWT (target state).** `JWT_ISSUER` + `JWT_AUDIENCE` env vars
  configure JWKS verification. Not yet exercised against a real user pool.
- **Dev backdoor.** When `NODE_ENV !== 'production'`, the JWT guard accepts
  HS256 tokens signed with `DEV_JWT_SECRET`. Used by local tooling and the
  e2e harness; gated off in production.

## 2. Tenants & users

| Method | Path                    | Roles                     |
| ------ | ----------------------- | ------------------------- |
| GET    | `/tenants/current`      | all                       |
| PATCH  | `/tenants/current`      | admin                     |
| GET    | `/users`                | admin                     |
| POST   | `/users`                | admin                     |
| PATCH  | `/users/:id`            | admin                     |
| GET    | `/roles`                | admin                     |

## 3. Customers (CRM-lite)

| Method | Path                              | Roles                          |
| ------ | --------------------------------- | ------------------------------ |
| GET    | `/customers`                      | admin, accountant, sales_rep   |
| POST   | `/customers`                      | admin, sales_rep               |
| GET    | `/customers/:id`                  | admin, accountant, sales_rep   |
| PATCH  | `/customers/:id`                  | admin, sales_rep               |
| GET    | `/customers/:id/purchases`        | admin, accountant, sales_rep   |
| GET    | `/customers/:id/balance`          | admin, accountant              |
| POST   | `/customers/import`               | admin (multipart csv)          |

## 4. Suppliers

| Method | Path                              | Roles                          |
| ------ | --------------------------------- | ------------------------------ |
| GET    | `/suppliers`                      | admin, inventory_manager       |
| POST   | `/suppliers`                      | admin, inventory_manager       |
| GET    | `/suppliers/:id`                  | admin, inventory_manager       |
| PATCH  | `/suppliers/:id`                  | admin, inventory_manager       |
| GET    | `/suppliers/:id/performance`      | admin, inventory_manager       |
| POST   | `/suppliers/import`               | admin (multipart csv)          |

## 5. Products

| Method | Path                              | Description                        |
| ------ | --------------------------------- | ---------------------------------- |
| GET    | `/products`                       | Search by name/sku/upc             |
| POST   | `/products`                       | Create                             |
| GET    | `/products/:id`                   | Details                            |
| PATCH  | `/products/:id`                   | Update                             |
| POST   | `/products/import`                | CSV/Excel bulk import              |
| GET    | `/products/export`                | CSV export                         |
| GET    | `/products/barcode/:upc`          | Resolve UPC → product (POS)        |

## 6. Inventory

| Method | Path                                              | Description                |
| ------ | ------------------------------------------------- | -------------------------- |
| GET    | `/warehouses`                                     | List                       |
| POST   | `/warehouses`                                     | Create                     |
| GET    | `/inventory/stock`                                | Filter by warehouse/product|
| POST   | `/inventory/adjustments`                          | Manual stock adjustment    |
| POST   | `/inventory/transfers`                            | Warehouse → warehouse      |
| GET    | `/inventory/batches`                              | Expiry listing             |
| GET    | `/inventory/low-stock`                            | Below reorder point        |
| POST   | `/inventory/stock/import`                         | CSV import stock on hand   |
| GET    | `/inventory/valuation?method=fifo`                | FIFO/LIFO valuation        |

## 7. Procurement

| Method | Path                              |
| ------ | --------------------------------- |
| GET    | `/purchase-orders`                |
| POST   | `/purchase-orders`                |
| POST   | `/purchase-orders/:id/approve`    |
| POST   | `/purchase-orders/:id/send`       |
| POST   | `/purchase-orders/:id/grn`        |
| GET    | `/purchase-orders/:id`            |

## 8. Sales & POS

| Method | Path                              | Description                       |
| ------ | --------------------------------- | --------------------------------- |
| GET    | `/sales-orders`                   | List (B2B + B2C)                  |
| POST   | `/sales-orders`                   | Create (B2B)                      |
| POST   | `/sales-orders/:id/confirm`       |                                   |
| POST   | `/sales-orders/:id/ship`          |                                   |
| POST   | `/pos/sessions/open`              | Cashier opens till                 |
| POST   | `/pos/sessions/:id/close`         | Close with cash count              |
| POST   | `/pos/sales`                      | Record a POS sale (idempotent)    |
| POST   | `/pos/sync`                       | Bulk replay offline sales          |

### Example — POS sale

```http
POST /v1/pos/sales
Authorization: Bearer <jwt>
Idempotency-Key: 9c85...-pos-00042

{
  "session_id": "5a0f...",
  "warehouse_id": "c1ab...",
  "customer_id": null,
  "currency": "USD",
  "tax_applied": true,
  "payment": { "method": "card", "reference": "stripe_pi_3..." },
  "items": [
    { "product_id": "b7...", "quantity": 2, "unit_price": 45.00, "tax_pct": 6.5 },
    { "product_id": "f3...", "quantity": 1, "unit_price": 80.00, "tax_pct": 6.5 }
  ],
  "discount_total": 5.00
}
```

Response `201`:
```json
{
  "id": "ord_01HT...",
  "order_no": "SO-2026-000123",
  "invoice": { "id":"inv_01HT...", "invoice_no":"INV-2026-000123",
               "pdf_url":"https://cdn.../signed/..." },
  "totals": { "subtotal": 170.00, "tax_total": 8.50, "discount_total": 5.00, "total": 173.50 }
}
```

## 9. Invoicing & payments

| Method | Path                                        | Description                     |
| ------ | ------------------------------------------- | ------------------------------- |
| GET    | `/invoices`                                 | Filter by status, customer      |
| POST   | `/invoices`                                 | Create (from order or manual)   |
| GET    | `/invoices/:id`                             |                                 |
| GET    | `/invoices/:id/pdf`                         | Signed S3 URL redirect          |
| POST   | `/invoices/:id/send`                        | Email via SES                   |
| POST   | `/invoices/:id/payments`                    | Record payment                  |
| POST   | `/invoices/:id/void`                        | admin                           |
| POST   | `/invoices/:id/qbo-sync`                    | Force QBO sync                  |
| POST   | `/invoices/recurring`                       | Define recurring rule           |

## 10. Accounts receivable / payable

| Method | Path                           | Description                         |
| ------ | ------------------------------ | ----------------------------------- |
| GET    | `/ar/aging`                    | 30/60/90/90+ buckets                |
| GET    | `/ar/reminders`                | List auto-reminders queued          |
| POST   | `/ar/reminders/run`            | Trigger reminder batch (admin)      |
| GET    | `/ap/bills`                    | Supplier bills                      |
| POST   | `/ap/bills`                    | Record supplier bill                |
| POST   | `/ap/bills/:id/approve`        | Approval workflow                   |
| POST   | `/ap/bills/:id/pay`            | Schedule/record payment             |

## 11. Payroll

| Method | Path                             | Description                        |
| ------ | -------------------------------- | ---------------------------------- |
| GET    | `/payroll/employees`             |                                    |
| POST   | `/payroll/employees`             |                                    |
| POST   | `/payroll/runs`                  | Create run for period              |
| POST   | `/payroll/runs/:id/calculate`    | Compute payslips                   |
| POST   | `/payroll/runs/:id/approve`      | Approve & lock                     |
| POST   | `/payroll/runs/:id/export`       | CSV + PDF payslips                 |

## 12. Reports

All reports return JSON and accept `?format=csv|xlsx|pdf` for export.

| Path                                    | Description                          |
| --------------------------------------- | ------------------------------------ |
| `/reports/sales/daily`                  | Sales by day                         |
| `/reports/sales/by-product`             | Top products                         |
| `/reports/sales/by-customer`            |                                      |
| `/reports/inventory/stock`              | Current stock                        |
| `/reports/inventory/valuation`          | FIFO valuation                       |
| `/reports/inventory/expiry`             | Batches nearing expiry               |
| `/reports/ar/aging`                     |                                      |
| `/reports/ap/aging`                     |                                      |
| `/reports/procurement/suppliers`        | Supplier performance                 |
| `/reports/payroll/summary`              |                                      |
| `/reports/barcodes`                     | UPC coverage / mismatches            |

## 13. Webhooks (inbound)

| Path                       | Provider            |
| -------------------------- | ------------------- |
| `/webhooks/quickbooks`     | QuickBooks Online   |
| `/webhooks/payments/:gw`   | Flutterwave, Paystack, Stripe |
| `/webhooks/twilio/sms`     | Delivery receipts   |

All webhooks verify HMAC signature; retries are idempotent.

## 14. Rate limits

- Default: 120 req/min per user, burst 30 in 5 s.
- POS endpoints: 600 req/min per device.
- Reports export: 10/min per user.
- `429` returns `Retry-After` seconds.
