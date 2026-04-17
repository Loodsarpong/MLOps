-- 0001_init.sql — base extensions, tenants, users, roles
-- Idempotent where reasonable; apply via node-pg-migrate.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------- Tenants ----------
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            CITEXT NOT NULL UNIQUE,
  base_currency   CHAR(3) NOT NULL DEFAULT 'GHS',
  timezone        TEXT NOT NULL DEFAULT 'Africa/Accra',
  plan            TEXT NOT NULL DEFAULT 'standard',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Roles ----------
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ---------- Users ----------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cognito_sub   TEXT UNIQUE,
  email         CITEXT NOT NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- ---------- Integrations (per tenant) ----------
CREATE TABLE tenant_integrations (
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL,       -- quickbooks, twilio, ses, stripe
  status         TEXT NOT NULL DEFAULT 'disconnected',
  config         JSONB NOT NULL DEFAULT '{}'::jsonb,
  secret_arn     TEXT,
  connected_at   TIMESTAMPTZ,
  last_error     TEXT,
  PRIMARY KEY (tenant_id, provider)
);

-- Tenant-aware trigger helpers
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_touch   BEFORE UPDATE ON tenants   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER users_touch     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
