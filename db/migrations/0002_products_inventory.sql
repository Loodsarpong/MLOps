-- 0002_products_inventory.sql — products, warehouses, batches, stock

CREATE TYPE customer_segment AS ENUM ('retail','wholesale','distributor','online');

CREATE TABLE customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  segment          customer_segment NOT NULL DEFAULT 'retail',
  email            CITEXT,
  phone            TEXT,
  billing_address  JSONB,
  shipping_address JSONB,
  tax_id           TEXT,
  credit_limit     NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency         CHAR(3) NOT NULL DEFAULT 'GHS',
  loyalty_points   INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_customer_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_segment ON customers(tenant_id, segment);
CREATE TRIGGER customers_touch BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE suppliers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code               TEXT NOT NULL,
  name               TEXT NOT NULL,
  contact_name       TEXT,
  email              CITEXT,
  phone              TEXT,
  address            JSONB,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  currency           CHAR(3) NOT NULL DEFAULT 'GHS',
  rating             NUMERIC(3,2),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_vendor_id      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);
CREATE TRIGGER suppliers_touch BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku                  TEXT NOT NULL,
  upc                  TEXT,
  name                 TEXT NOT NULL,
  description          TEXT,
  category             TEXT,
  uom                  TEXT NOT NULL DEFAULT 'unit',
  is_raw_material      BOOLEAN NOT NULL DEFAULT FALSE,
  is_tracked_by_batch  BOOLEAN NOT NULL DEFAULT TRUE,
  tax_rate_pct         NUMERIC(5,2) NOT NULL DEFAULT 0,
  cost_price           NUMERIC(14,4) NOT NULL DEFAULT 0,
  base_price           NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency             CHAR(3) NOT NULL DEFAULT 'GHS',
  weight_grams         INTEGER,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  qbo_item_id          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, sku),
  UNIQUE (tenant_id, upc)
);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_category ON products(tenant_id, category);
CREATE INDEX idx_products_search ON products USING GIN (to_tsvector('simple', name || ' ' || COALESCE(description,'')));
CREATE TRIGGER products_touch BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE price_tiers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  segment      customer_segment NOT NULL,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  unit_price   NUMERIC(14,4) NOT NULL,
  currency     CHAR(3) NOT NULL DEFAULT 'GHS'
);
CREATE INDEX idx_price_tiers_product ON price_tiers(tenant_id, product_id, segment);

CREATE TABLE warehouses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'dc',   -- factory, dc, outlet
  address    JSONB,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_warehouses_tenant ON warehouses(tenant_id);

CREATE TABLE batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_no        TEXT NOT NULL,
  manufactured_on DATE,
  expires_on      DATE,
  cost_price      NUMERIC(14,4) NOT NULL,
  supplier_id     UUID REFERENCES suppliers(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, product_id, batch_no)
);
CREATE INDEX idx_batches_expiry ON batches(tenant_id, expires_on);

CREATE TABLE inventory_stock (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id   UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  batch_id       UUID REFERENCES batches(id),
  quantity       NUMERIC(14,4) NOT NULL DEFAULT 0,
  reserved       NUMERIC(14,4) NOT NULL DEFAULT 0,
  reorder_point  NUMERIC(14,4),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, product_id, warehouse_id, batch_id)
);
CREATE INDEX idx_stock_tenant ON inventory_stock(tenant_id);
CREATE INDEX idx_stock_low ON inventory_stock(tenant_id, product_id, warehouse_id) WHERE reorder_point IS NOT NULL;
CREATE TRIGGER stock_touch BEFORE UPDATE ON inventory_stock FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE stock_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES products(id),
  warehouse_id   UUID NOT NULL REFERENCES warehouses(id),
  batch_id       UUID REFERENCES batches(id),
  movement_type  TEXT NOT NULL,
  quantity       NUMERIC(14,4) NOT NULL,
  unit_cost      NUMERIC(14,4),
  reference_type TEXT,
  reference_id   UUID,
  performed_by   UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_movements_product ON stock_movements(tenant_id, product_id, created_at DESC);
CREATE INDEX idx_movements_ref ON stock_movements(tenant_id, reference_type, reference_id);
