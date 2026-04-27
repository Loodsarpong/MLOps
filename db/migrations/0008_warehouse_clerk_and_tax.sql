-- 0008_warehouse_clerk_and_tax.sql
-- - Warehouse clerk contact (target for fulfillment emails)
-- - Tenant-level default sales tax rate (e.g. 7.8% for Hamilton County, OH)
-- - Per-order tax toggle / amount columns on sales_orders
-- - notification_log table for idempotent outbound notifications

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS clerk_name  TEXT,
  ADD COLUMN IF NOT EXISTS clerk_email TEXT,
  ADD COLUMN IF NOT EXISTS clerk_phone TEXT;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS default_tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS tax_applied   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tax_rate_pct  NUMERIC(5,2);

CREATE TABLE IF NOT EXISTS notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ref_type    TEXT NOT NULL,            -- 'order-fulfillment'
  ref_id      UUID NOT NULL,            -- sales_order id
  recipient   TEXT NOT NULL,
  from_addr   TEXT,
  channel     TEXT NOT NULL,            -- 'email-direct' | 'email-sqs'
  status      TEXT NOT NULL,            -- 'queued' | 'sent' | 'failed'
  error       TEXT,
  message_id  TEXT,                     -- SES MessageId (or SQS MessageId)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ref_type, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_notif_log_tenant
  ON notification_log(tenant_id, created_at DESC);

-- Demo seed: Brendamour clerk + Hamilton County, OH sales tax rate.
UPDATE tenants
   SET default_tax_rate_pct = 7.80
 WHERE slug = 'naturalshea';

UPDATE warehouses w
   SET clerk_name  = 'Don',
       clerk_email = 'ba2@brendamour.com',
       clerk_phone = '+1-513-247-0077 ext 15'
  FROM tenants t
 WHERE w.tenant_id = t.id
   AND t.slug = 'naturalshea'
   AND w.code = 'WH-BLUEASH';
