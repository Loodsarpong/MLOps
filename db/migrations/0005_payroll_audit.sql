-- 0005_payroll_audit.sql — payroll, audit logs, notifications, materialized views

CREATE TABLE employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  email         CITEXT,
  department    TEXT,
  position      TEXT,
  base_salary   NUMERIC(14,2) NOT NULL,
  currency      CHAR(3) NOT NULL DEFAULT 'GHS',
  hired_on      DATE NOT NULL,
  terminated_on DATE,
  bank_details  JSONB,
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_employees_tenant ON employees(tenant_id);

CREATE TABLE payroll_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',
  total_gross  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net    NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_by  UUID REFERENCES users(id),
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payroll_runs_tenant ON payroll_runs(tenant_id, period_start);

CREATE TABLE payslips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  run_id      UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  gross       NUMERIC(14,2) NOT NULL,
  tax         NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductions  NUMERIC(14,2) NOT NULL DEFAULT 0,
  net         NUMERIC(14,2) NOT NULL,
  pdf_s3_key  TEXT,
  UNIQUE (run_id, employee_id)
);

CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  actor_id      UUID REFERENCES users(id),
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  before_state  JSONB,
  after_state   JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_logs(tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_actor  ON audit_logs(tenant_id, actor_id, created_at DESC);

-- Block mutations on audit_logs (enforced in app by role; this is defense-in-depth)
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  user_id    UUID REFERENCES users(id),
  channel    TEXT NOT NULL,   -- in_app, email, sms
  topic      TEXT NOT NULL,
  payload    JSONB NOT NULL,
  read_at    TIMESTAMPTZ,
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(tenant_id, user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(tenant_id, user_id) WHERE read_at IS NULL;

-- Materialized views for reports (refreshed by worker)
CREATE MATERIALIZED VIEW mv_sales_daily AS
SELECT tenant_id,
       (created_at AT TIME ZONE 'UTC')::date AS day,
       COUNT(*)            AS order_count,
       SUM(total)          AS total,
       SUM(tax_total)      AS tax_total,
       SUM(discount_total) AS discount_total
FROM sales_orders
WHERE status <> 'cancelled'
GROUP BY 1, 2;
CREATE UNIQUE INDEX ON mv_sales_daily (tenant_id, day);

CREATE MATERIALIZED VIEW mv_ar_aging AS
SELECT i.tenant_id,
       i.customer_id,
       SUM(CASE WHEN (CURRENT_DATE - i.due_date) BETWEEN 0  AND 30 THEN i.balance_due ELSE 0 END) AS bucket_0_30,
       SUM(CASE WHEN (CURRENT_DATE - i.due_date) BETWEEN 31 AND 60 THEN i.balance_due ELSE 0 END) AS bucket_31_60,
       SUM(CASE WHEN (CURRENT_DATE - i.due_date) BETWEEN 61 AND 90 THEN i.balance_due ELSE 0 END) AS bucket_61_90,
       SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 90               THEN i.balance_due ELSE 0 END) AS bucket_90_plus,
       SUM(i.balance_due) AS total_due
FROM invoices i
WHERE i.status IN ('issued','partial','overdue')
GROUP BY 1, 2;
CREATE UNIQUE INDEX ON mv_ar_aging (tenant_id, customer_id);
