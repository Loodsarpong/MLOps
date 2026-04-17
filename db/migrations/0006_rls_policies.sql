-- 0006_rls_policies.sql — enable Row Level Security for all tenant tables
-- The API sets `SET LOCAL app.tenant_id = '<uuid>'` at transaction start.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users','customers','suppliers','products','price_tiers','warehouses','batches',
    'inventory_stock','stock_movements','sales_orders','sales_order_items','pos_sessions',
    'invoices','invoice_lines','payments','ar_transactions',
    'purchase_orders','po_items','grn','grn_items','ap_transactions','approvals',
    'employees','payroll_runs','payslips','audit_logs','notifications','idempotency_keys',
    'tenant_integrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
                      USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
                      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)$p$, t);
  END LOOP;
END $$;

-- Dedicated app role used by the backend (created out-of-band in prod).
-- DO $$ BEGIN
--   CREATE ROLE ns_app LOGIN PASSWORD '...';
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- GRANT USAGE ON SCHEMA public TO ns_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ns_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ns_app;
