# Database Schema

PostgreSQL 15, UTF-8, `uuid-ossp` + `pgcrypto` + `citext` extensions enabled.
Every business table carries `tenant_id UUID NOT NULL` and is wrapped in a
Row-Level-Security policy (see `db/migrations/0001_init.sql`).

## 1. Entity–relationship overview

```
tenants ─┬─< users ─── user_roles ─── roles
         │
         ├─< customers ─┬─< sales_orders ─< sales_order_items
         │              │                     │
         │              │                     ├─< shipments
         │              │                     └─> invoices ─< invoice_lines
         │              │                                     │
         │              └─< ar_transactions ─< payments ──────┘
         │
         ├─< suppliers ─┬─< purchase_orders ─< po_items ─< grn ─< grn_items
         │              └─< ap_transactions
         │
         ├─< products ──< product_variants ─< inventory_stock ──── batches
         │                         │                                │
         │                         └─< price_tiers                   │
         │                                                           │
         ├─< warehouses ─< inventory_stock                           │
         │                                                           │
         ├─< employees ─< payroll_runs ─< payslips                   │
         │                                                           │
         ├─< audit_logs                                              │
         └─< notifications                                           ┘
```

## 2. Table definitions (DDL excerpt)

Full migrations live in `db/migrations/`. Core tables shown below; the
migration file is executable SQL.

### 2.1 Tenancy & identity

```sql
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            CITEXT NOT NULL UNIQUE,
  base_currency   CHAR(3) NOT NULL DEFAULT 'USD',
  timezone        TEXT NOT NULL DEFAULT 'America/New_York',
  plan            TEXT NOT NULL DEFAULT 'standard',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- added in 0008_warehouse_clerk_and_tax.sql for US sales-tax rollout
  default_tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: 0007_locale_us.sql flipped the historical defaults from
-- 'GHS' / 'Africa/Accra' to 'USD' / 'America/New_York' when the tenant was
-- switched to US-only operations. The shape above reflects the current state.

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cognito_sub     TEXT UNIQUE,
  email           CITEXT NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  -- added in 0010_user_passwords.sql (Phase A — real password auth):
  password_hash         TEXT,
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);
-- Passwords are stored as argon2id hashes; the auth service implements a
-- 5-strike lockout (`failed_login_count` + `locked_until`). When an admin
-- sets/resets a password, `must_change_password = TRUE` forces the user to
-- the /change-password screen on next sign-in.

CREATE TABLE roles (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code  TEXT NOT NULL UNIQUE,  -- admin, accountant, sales_rep, inventory_manager, cashier, viewer
  name  TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
```

### 2.2 Parties — customers & suppliers

```sql
CREATE TYPE customer_segment AS ENUM ('retail', 'wholesale', 'distributor', 'online');

CREATE TABLE customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,                -- CUST-000123
  name             TEXT NOT NULL,
  segment          customer_segment NOT NULL DEFAULT 'retail',
  email            CITEXT,
  phone            TEXT,
  billing_address  JSONB,
  shipping_address JSONB,
  tax_id           TEXT,
  credit_limit     NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency         CHAR(3) NOT NULL DEFAULT 'USD',
  loyalty_points   INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_customer_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE suppliers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,                -- SUP-000045
  name             TEXT NOT NULL,
  contact_name     TEXT,
  email            CITEXT,
  phone            TEXT,
  address          JSONB,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  currency         CHAR(3) NOT NULL DEFAULT 'USD',
  rating           NUMERIC(3,2),                 -- 0.00 - 5.00
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_vendor_id    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);
```

### 2.3 Products, variants, pricing

```sql
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku             TEXT NOT NULL,                 -- SKU-SHEA-BB-200
  upc             TEXT,                          -- GS1 barcode
  name            TEXT NOT NULL,                 -- "Raw Shea Body Butter 200g"
  description     TEXT,
  category        TEXT,                          -- body-care, hair-care, soap, raw-material
  uom             TEXT NOT NULL DEFAULT 'unit',  -- unit, kg, l
  is_raw_material BOOLEAN NOT NULL DEFAULT FALSE,
  is_tracked_by_batch BOOLEAN NOT NULL DEFAULT TRUE,
  tax_rate_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  cost_price      NUMERIC(14,4) NOT NULL DEFAULT 0,
  base_price      NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  weight_grams    INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_item_id     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, sku),
  UNIQUE(tenant_id, upc)
);

CREATE TABLE price_tiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  segment       customer_segment NOT NULL,
  min_quantity  INTEGER NOT NULL DEFAULT 1,
  unit_price    NUMERIC(14,4) NOT NULL,
  currency      CHAR(3) NOT NULL DEFAULT 'USD'
);
```

### 2.4 Warehouses, batches, stock

```sql
CREATE TABLE warehouses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'dc',    -- factory, dc, outlet
  address      JSONB,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  -- added in 0008_warehouse_clerk_and_tax.sql so POS sales can email the
  -- on-duty clerk a copy of the receipt:
  clerk_name   TEXT,
  clerk_email  CITEXT,
  clerk_phone  TEXT,
  UNIQUE(tenant_id, code)
);

CREATE TABLE batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_no     TEXT NOT NULL,                   -- LOT-2026-04-A
  manufactured_on DATE,
  expires_on   DATE,
  cost_price   NUMERIC(14,4) NOT NULL,
  supplier_id  UUID REFERENCES suppliers(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, product_id, batch_no)
);

CREATE TABLE inventory_stock (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  batch_id      UUID REFERENCES batches(id),
  quantity      NUMERIC(14,4) NOT NULL DEFAULT 0,
  reserved      NUMERIC(14,4) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(14,4),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, product_id, warehouse_id, batch_id)
);

CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  batch_id        UUID REFERENCES batches(id),
  movement_type   TEXT NOT NULL,  -- receipt, issue, transfer_in, transfer_out, adjustment, return
  quantity        NUMERIC(14,4) NOT NULL,
  unit_cost       NUMERIC(14,4),
  reference_type  TEXT,           -- purchase_order, sales_order, manual
  reference_id    UUID,
  performed_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON stock_movements (tenant_id, product_id, created_at DESC);
```

### 2.5 Sales & invoicing

```sql
CREATE TYPE order_status AS ENUM ('draft','confirmed','picked','shipped','delivered','cancelled','returned');
CREATE TYPE invoice_status AS ENUM ('draft','issued','partial','paid','overdue','void');
CREATE TYPE payment_method AS ENUM ('cash','card','mobile_money','bank_transfer','cheque','credit');

CREATE TABLE sales_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_no       TEXT NOT NULL,
  customer_id    UUID REFERENCES customers(id),
  warehouse_id   UUID NOT NULL REFERENCES warehouses(id),
  channel        TEXT NOT NULL DEFAULT 'b2c',   -- b2c, b2b, pos, online
  status         order_status NOT NULL DEFAULT 'draft',
  currency       CHAR(3) NOT NULL DEFAULT 'USD',
  fx_rate        NUMERIC(14,6) NOT NULL DEFAULT 1,
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- added in 0008_warehouse_clerk_and_tax.sql to make tax a per-sale toggle
  -- (POS can ring up tax-exempt sales without changing tenant defaults):
  tax_applied    BOOLEAN NOT NULL DEFAULT TRUE,
  tax_rate_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, order_no)
);

CREATE TABLE sales_order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  order_id      UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id),
  batch_id      UUID REFERENCES batches(id),
  quantity      NUMERIC(14,4) NOT NULL,
  unit_price    NUMERIC(14,4) NOT NULL,
  discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total    NUMERIC(14,2) NOT NULL
);

CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_no       TEXT NOT NULL,
  order_id         UUID REFERENCES sales_orders(id),
  customer_id      UUID NOT NULL REFERENCES customers(id),
  issue_date       DATE NOT NULL,
  due_date         DATE NOT NULL,
  currency         CHAR(3) NOT NULL,
  fx_rate          NUMERIC(14,6) NOT NULL DEFAULT 1,
  subtotal         NUMERIC(14,2) NOT NULL,
  tax_total        NUMERIC(14,2) NOT NULL,
  total            NUMERIC(14,2) NOT NULL,
  amount_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due      NUMERIC(14,2) NOT NULL,
  status           invoice_status NOT NULL DEFAULT 'draft',
  pdf_s3_key       TEXT,
  recurring_rule   JSONB,                   -- { freq:'monthly', day:1, end:null }
  qbo_invoice_id   TEXT,
  qbo_sync_status  TEXT,                    -- pending, synced, error
  qbo_last_sync_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, invoice_no)
);

CREATE TABLE invoice_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  description TEXT NOT NULL,
  quantity   NUMERIC(14,4) NOT NULL,
  unit_price NUMERIC(14,4) NOT NULL,
  tax_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL
);

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id      UUID REFERENCES invoices(id),
  customer_id     UUID REFERENCES customers(id),
  amount          NUMERIC(14,2) NOT NULL,
  currency        CHAR(3) NOT NULL,
  method          payment_method NOT NULL,
  reference       TEXT,                        -- gateway txn id
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by     UUID REFERENCES users(id)
);

CREATE TABLE ar_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  customer_id    UUID NOT NULL REFERENCES customers(id),
  invoice_id     UUID REFERENCES invoices(id),
  payment_id     UUID REFERENCES payments(id),
  txn_type       TEXT NOT NULL,            -- invoice, payment, credit_note, write_off
  amount         NUMERIC(14,2) NOT NULL,   -- +ve increases balance, -ve reduces
  currency       CHAR(3) NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON ar_transactions (tenant_id, customer_id, occurred_at DESC);
```

### 2.6 Procurement & AP

```sql
CREATE TYPE po_status AS ENUM ('draft','approved','sent','partial','received','closed','cancelled');

CREATE TABLE purchase_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_no          TEXT NOT NULL,
  supplier_id    UUID NOT NULL REFERENCES suppliers(id),
  warehouse_id   UUID NOT NULL REFERENCES warehouses(id),
  status         po_status NOT NULL DEFAULT 'draft',
  currency       CHAR(3) NOT NULL,
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_date  DATE,
  approved_by    UUID REFERENCES users(id),
  approved_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, po_no)
);

CREATE TABLE po_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  po_id       UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  quantity    NUMERIC(14,4) NOT NULL,
  received_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost   NUMERIC(14,4) NOT NULL,
  tax_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total  NUMERIC(14,2) NOT NULL
);

CREATE TABLE grn (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  po_id        UUID NOT NULL REFERENCES purchase_orders(id),
  grn_no       TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_by  UUID REFERENCES users(id),
  UNIQUE(tenant_id, grn_no)
);

CREATE TABLE grn_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  grn_id      UUID NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
  po_item_id  UUID NOT NULL REFERENCES po_items(id),
  batch_id    UUID REFERENCES batches(id),
  quantity    NUMERIC(14,4) NOT NULL,
  unit_cost   NUMERIC(14,4) NOT NULL
);

CREATE TABLE ap_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  supplier_id   UUID NOT NULL REFERENCES suppliers(id),
  po_id         UUID REFERENCES purchase_orders(id),
  txn_type      TEXT NOT NULL,           -- bill, payment, credit_note
  amount        NUMERIC(14,2) NOT NULL,
  currency      CHAR(3) NOT NULL,
  due_date      DATE,
  paid_at       TIMESTAMPTZ,
  expense_category TEXT,                 -- raw_materials, logistics, utilities, salaries...
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.7 Payroll, audit, notifications

```sql
CREATE TABLE employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  code          TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  email         CITEXT,
  department    TEXT,
  position      TEXT,
  base_salary   NUMERIC(14,2) NOT NULL,
  currency      CHAR(3) NOT NULL DEFAULT 'USD',
  hired_on      DATE NOT NULL,
  terminated_on DATE,
  bank_details  JSONB,
  UNIQUE(tenant_id, code)
);

CREATE TABLE payroll_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft, approved, paid
  total_gross   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net     NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ
);

CREATE TABLE payslips (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  run_id       UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES employees(id),
  gross        NUMERIC(14,2) NOT NULL,
  tax          NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions   NUMERIC(14,2) NOT NULL DEFAULT 0,
  net          NUMERIC(14,2) NOT NULL,
  pdf_s3_key   TEXT
);

CREATE TABLE audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  actor_id     UUID REFERENCES users(id),
  action       TEXT NOT NULL,         -- create, update, delete, approve, void
  entity_type  TEXT NOT NULL,         -- invoice, payment, purchase_order, ...
  entity_id    UUID,
  before_state JSONB,
  after_state  JSONB,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON audit_logs (tenant_id, entity_type, entity_id, created_at DESC);

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  user_id      UUID REFERENCES users(id),
  channel      TEXT NOT NULL,         -- in_app, email, sms
  topic        TEXT NOT NULL,         -- low_stock, invoice_overdue, po_approved
  payload      JSONB NOT NULL,
  read_at      TIMESTAMPTZ,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- added in 0008_warehouse_clerk_and_tax.sql — dedupe outbound notifications
-- (e.g., the POS sale → clerk email side-effect is keyed here so a retried
-- POST does not send a second email):
CREATE TABLE notification_log (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  dedupe_key    TEXT NOT NULL,
  channel       TEXT NOT NULL,
  recipient     TEXT NOT NULL,
  topic         TEXT NOT NULL,
  payload       JSONB,
  status        TEXT NOT NULL,        -- queued, sent, failed
  error         TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, dedupe_key)
);
```

## 3. Indexing & performance notes

- Composite indexes on `(tenant_id, <foreign_key>)` for every large table.
- Partial indexes for status filters:
  `CREATE INDEX ON invoices (tenant_id, due_date) WHERE status IN ('issued','partial','overdue');`
- Materialized views for heavy dashboards:
  - `mv_sales_daily (tenant_id, date, total, order_count)`
  - `mv_ar_aging (tenant_id, customer_id, bucket_0_30, bucket_31_60, bucket_61_90, bucket_90_plus)`
  - Refreshed nightly by a worker; concurrent refresh for zero-downtime.

## 4. Row-Level Security

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

The API sets the per-request tenant via
`SELECT set_config('app.tenant_id', '<uuid>', true)` (the `true` flag scopes
the setting to the surrounding transaction). This replaced the original
`SET LOCAL` approach in commit `8abc42f` because Kysely's pooled connections
did not always run inside an explicit transaction, causing the setting to
leak between requests.

Migration `0009_relax_force_rls.sql` removed `FORCE ROW LEVEL SECURITY` from
the tenant-scoped tables so admin / non-tenant-scoped reads (user provisioning,
health checks) work without a tenant context. RLS is still active for ordinary
authenticated reads.
