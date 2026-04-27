-- 02_demo_tenant.sql — demo NaturalShea tenant (US ops) with single Brendamour warehouse, products, customers

WITH t AS (
  INSERT INTO tenants (name, slug, base_currency, timezone, default_tax_rate_pct)
  VALUES ('NaturalShea Care', 'naturalshea', 'USD', 'America/New_York', 7.80)
  RETURNING id
)
INSERT INTO warehouses (tenant_id, code, name, type, address, clerk_name, clerk_email, clerk_phone)
SELECT t.id, v.code, v.name, v.type, v.address, v.clerk_name, v.clerk_email, v.clerk_phone
FROM t, (VALUES
  ('WH-BLUEASH', 'Brendamour Blue Ash DC', 'dc',
   jsonb_build_object(
     'company','Brendamour Warehousing Inc',
     'street', '11400 Grooms Road',
     'city',   'Cincinnati',
     'state',  'OH',
     'postal', '45242',
     'country','US',
     'phone',  '+1-513-247-0077 ext 15'
   ),
   'Don', 'ba2@brendamour.com', '+1-513-247-0077 ext 15')
) AS v(code, name, type, address, clerk_name, clerk_email, clerk_phone);

WITH t AS (SELECT id FROM tenants WHERE slug='naturalshea')
INSERT INTO products (tenant_id, sku, upc, name, category, uom, is_tracked_by_batch, tax_rate_pct, cost_price, base_price)
SELECT t.id, sku, upc, name, category, uom, true, 0, cost, price FROM t, (VALUES
  ('SKU-SHEA-BB-200','0840000012345','Raw Shea Body Butter 200g','body-care','unit', 18.50, 35.00),
  ('SKU-SHEA-BB-500','0840000012352','Raw Shea Body Butter 500g','body-care','unit', 40.00, 78.00),
  ('SKU-SHEA-SOAP',  '0840000012369','African Black Soap Bar',   'body-care','unit',  8.00, 18.00),
  ('SKU-SHEA-HAIR',  '0840000012376','Shea Hair Butter 150ml',   'hair-care','unit', 22.00, 42.00),
  ('SKU-RAW-SHEA-KG','0840000012390','Unrefined Shea Butter (raw)','raw-material','kg', 45.00, 80.00)
) AS v(sku, upc, name, category, uom, cost, price);

WITH t AS (SELECT id FROM tenants WHERE slug='naturalshea')
INSERT INTO customers (tenant_id, code, name, segment, email, phone, currency, credit_limit)
SELECT t.id, code, name, segment::customer_segment, email, phone, 'USD', credit FROM t, (VALUES
  ('CUST-0001','Beauty Haven LLC',     'wholesale',   'orders@beautyhaven.com','+1-513-555-0101', 5000),
  ('CUST-0002','Radiant Skin Stores',  'distributor', 'buy@radiantskin.us',    '+1-614-555-0144',20000),
  ('CUST-0003','Walk-in Retail',       'retail',       NULL,                    NULL,              0)
) AS v(code, name, segment, email, phone, credit);

WITH t AS (SELECT id FROM tenants WHERE slug='naturalshea')
INSERT INTO suppliers (tenant_id, code, name, contact_name, email, phone, currency, payment_terms_days)
SELECT t.id, code, name, contact, email, phone, 'USD', terms FROM t, (VALUES
  ('SUP-0001','Midwest Shea Cooperative','Anita Brooks', 'anita@midwestshea.coop', '+1-513-555-0210', 30),
  ('SUP-0002','Queen City Packaging',    'Marcus Reed',  'sales@queencitypack.com','+1-513-555-0288', 45)
) AS v(code, name, contact, email, phone, terms);

-- Demo admin user (dev-only; password is 'dev-password' via AuthService.devLogin)
WITH t AS (SELECT id FROM tenants WHERE slug='naturalshea'),
     u AS (
       INSERT INTO users (tenant_id, email, full_name)
       SELECT t.id, 'lsarpong@naturalsheacare.com', 'L Sarpong' FROM t
       RETURNING id
     )
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM u, roles r WHERE r.code = 'admin';
