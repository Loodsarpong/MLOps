-- 0003_sales_invoicing.sql — sales orders, invoices, payments, AR

CREATE TYPE order_status   AS ENUM ('draft','confirmed','picked','shipped','delivered','cancelled','returned');
CREATE TYPE invoice_status AS ENUM ('draft','issued','partial','paid','overdue','void');
CREATE TYPE payment_method AS ENUM ('cash','card','mobile_money','bank_transfer','cheque','credit');

CREATE TABLE sales_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_no       TEXT NOT NULL,
  customer_id    UUID REFERENCES customers(id),
  warehouse_id   UUID NOT NULL REFERENCES warehouses(id),
  channel        TEXT NOT NULL DEFAULT 'b2c',
  status         order_status NOT NULL DEFAULT 'draft',
  currency       CHAR(3) NOT NULL DEFAULT 'GHS',
  fx_rate        NUMERIC(14,6) NOT NULL DEFAULT 1,
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_no)
);
CREATE INDEX idx_sales_orders_tenant ON sales_orders(tenant_id, created_at DESC);
CREATE INDEX idx_sales_orders_status ON sales_orders(tenant_id, status);
CREATE TRIGGER sales_orders_touch BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE sales_order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  order_id     UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  batch_id     UUID REFERENCES batches(id),
  quantity     NUMERIC(14,4) NOT NULL,
  unit_price   NUMERIC(14,4) NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total   NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_soi_order ON sales_order_items(order_id);

CREATE TABLE pos_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  cashier_id   UUID NOT NULL REFERENCES users(id),
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at    TIMESTAMPTZ,
  opening_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(14,2),
  expected_cash NUMERIC(14,2),
  variance     NUMERIC(14,2),
  notes        TEXT
);

CREATE TABLE idempotency_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  key         TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  UNIQUE (tenant_id, key)
);
CREATE INDEX idx_idem_expiry ON idempotency_keys(expires_at);

CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_no        TEXT NOT NULL,
  order_id          UUID REFERENCES sales_orders(id),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  issue_date        DATE NOT NULL,
  due_date          DATE NOT NULL,
  currency          CHAR(3) NOT NULL,
  fx_rate           NUMERIC(14,6) NOT NULL DEFAULT 1,
  subtotal          NUMERIC(14,2) NOT NULL,
  tax_total         NUMERIC(14,2) NOT NULL,
  total             NUMERIC(14,2) NOT NULL,
  amount_paid       NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due       NUMERIC(14,2) NOT NULL,
  status            invoice_status NOT NULL DEFAULT 'draft',
  pdf_s3_key        TEXT,
  recurring_rule    JSONB,
  qbo_invoice_id    TEXT,
  qbo_sync_status   TEXT,
  qbo_last_sync_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, invoice_no)
);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_customer ON invoices(tenant_id, customer_id, status);
CREATE INDEX idx_invoices_due ON invoices(tenant_id, due_date) WHERE status IN ('issued','partial','overdue');
CREATE TRIGGER invoices_touch BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE invoice_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id),
  description TEXT NOT NULL,
  quantity    NUMERIC(14,4) NOT NULL,
  unit_price  NUMERIC(14,4) NOT NULL,
  tax_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total  NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id  UUID REFERENCES invoices(id),
  customer_id UUID REFERENCES customers(id),
  amount      NUMERIC(14,2) NOT NULL,
  currency    CHAR(3) NOT NULL,
  method      payment_method NOT NULL,
  reference   TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID REFERENCES users(id)
);
CREATE INDEX idx_payments_invoice ON payments(tenant_id, invoice_id);
CREATE INDEX idx_payments_customer ON payments(tenant_id, customer_id, received_at DESC);

CREATE TABLE ar_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_id  UUID REFERENCES invoices(id),
  payment_id  UUID REFERENCES payments(id),
  txn_type    TEXT NOT NULL,
  amount      NUMERIC(14,2) NOT NULL,
  currency    CHAR(3) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ar_customer ON ar_transactions(tenant_id, customer_id, occurred_at DESC);
