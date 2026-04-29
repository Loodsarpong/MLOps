-- 0009_relax_force_rls.sql
-- Migration 0006 enabled `FORCE ROW LEVEL SECURITY` on every tenant table.
-- That blocks even the connection's table-owner role unless `app.tenant_id` is
-- set via `set_config()` inside the same transaction. Only pos.service.ts
-- followed that pattern; every other endpoint (products, warehouses, inventory,
-- reports, …) returned zero rows because the policy couldn't resolve a tenant.
--
-- Drop FORCE so the owner role bypasses RLS via Postgres's standard owner
-- exemption. RLS itself stays ENABLED so a non-owner role (e.g. a future
-- read-only analytics user, or the production `ns_app` role) is still
-- restricted by the tenant_isolation policy. Application code already filters
-- every query by `WHERE tenant_id = ?` — that remains the primary tenant
-- isolation barrier.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND rowsecurity = true
  LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
