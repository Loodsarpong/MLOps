-- 0004_procurement_ap.sql — POs, GRN, AP transactions

CREATE TYPE po_status AS ENUM ('draft','approved','sent','partial','received','closed','cancelled');

CREATE TABLE purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_no         TEXT NOT NULL,
  supplier_id   UUID NOT NULL REFERENCES suppliers(id),
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  status        po_status NOT NULL DEFAULT 'draft',
  currency      CHAR(3) NOT NULL,
  subtotal      NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_date DATE,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, po_no)
);
CREATE INDEX idx_po_tenant ON purchase_orders(tenant_id, created_at DESC);
CREATE INDEX idx_po_supplier ON purchase_orders(tenant_id, supplier_id, status);
CREATE TRIGGER po_touch BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE po_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  po_id        UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  quantity     NUMERIC(14,4) NOT NULL,
  received_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost    NUMERIC(14,4) NOT NULL,
  tax_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total   NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_po_items_po ON po_items(po_id);

CREATE TABLE grn (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  po_id       UUID NOT NULL REFERENCES purchase_orders(id),
  grn_no      TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_by UUID REFERENCES users(id),
  UNIQUE (tenant_id, grn_no)
);

CREATE TABLE grn_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  grn_id     UUID NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
  po_item_id UUID NOT NULL REFERENCES po_items(id),
  batch_id   UUID REFERENCES batches(id),
  quantity   NUMERIC(14,4) NOT NULL,
  unit_cost  NUMERIC(14,4) NOT NULL
);

CREATE TABLE ap_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  supplier_id      UUID NOT NULL REFERENCES suppliers(id),
  po_id            UUID REFERENCES purchase_orders(id),
  txn_type         TEXT NOT NULL,
  amount           NUMERIC(14,2) NOT NULL,
  currency         CHAR(3) NOT NULL,
  due_date         DATE,
  paid_at          TIMESTAMPTZ,
  expense_category TEXT,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ap_supplier ON ap_transactions(tenant_id, supplier_id, occurred_at DESC);

-- Approval workflow (generic): for POs, bills, payroll runs
CREATE TABLE approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  entity_type     TEXT NOT NULL,         -- purchase_order, ap_bill, payroll_run
  entity_id       UUID NOT NULL,
  requested_by    UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  comment         TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX idx_approvals_entity ON approvals(tenant_id, entity_type, entity_id);
