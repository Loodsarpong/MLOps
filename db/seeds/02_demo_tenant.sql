-- 02_demo_tenant.sql — demo NaturalShea tenant with warehouses, products, customers

WITH t AS (
  INSERT INTO tenants (name, slug, base_currency, timezone)
  VALUES ('NaturalShea Care', 'naturalshea', 'GHS', 'Africa/Accra')
  RETURNING id
)
INSERT INTO warehouses (tenant_id, code, name, type, address)
SELECT t.id, v.code, v.name, v.type, v.address
FROM t, (VALUES
  ('WH-TAMALE-FAC',  'Tamale Factory',       'factory', '{"city":"Tamale","country":"GH"}'::jsonb),
  ('WH-ACCRA-DC',    'Accra Distribution',   'dc',      '{"city":"Accra","country":"GH"}'::jsonb),
  ('WH-KUMASI-OUT',  'Kumasi Retail Outlet', 'outlet',  '{"city":"Kumasi","country":"GH"}'::jsonb)
) AS v(code, name, type, address);

WITH t AS (SELECT id FROM tenants WHERE slug='naturalshea')
INSERT INTO products (tenant_id, sku, upc, name, category, uom, is_tracked_by_batch, tax_rate_pct, cost_price, base_price)
SELECT t.id, sku, upc, name, category, uom, true, 5, cost, price FROM t, (VALUES
  ('SKU-SHEA-BB-200','0840000012345','Raw Shea Body Butter 200g','body-care','unit', 18.50, 35.00),
  ('SKU-SHEA-BB-500','0840000012352','Raw Shea Body Butter 500g','body-care','unit', 40.00, 78.00),
  ('SKU-SHEA-SOAP',  '0840000012369','African Black Soap Bar',   'body-care','unit',  8.00, 18.00),
  ('SKU-SHEA-HAIR',  '0840000012376','Shea Hair Butter 150ml',   'hair-care','unit', 22.00, 42.00),
  ('SKU-RAW-SHEA-KG','0840000012390','Unrefined Shea Butter (raw)','raw-material','kg', 45.00, 80.00)
) AS v(sku, upc, name, category, uom, cost, price);

WITH t AS (SELECT id FROM tenants WHERE slug='naturalshea')
INSERT INTO customers (tenant_id, code, name, segment, email, phone, currency, credit_limit)
SELECT t.id, code, name, segment::customer_segment, email, phone, 'GHS', credit FROM t, (VALUES
  ('CUST-0001','Beauty Haven Ltd',    'wholesale',   'orders@beautyhaven.com','+233501234567', 5000),
  ('CUST-0002','Radiant Skin Stores', 'distributor', 'buy@radiantskin.africa','+233244111222',20000),
  ('CUST-0003','Walk-in Retail',      'retail',       NULL,                    NULL,              0)
) AS v(code, name, segment, email, phone, credit);

WITH t AS (SELECT id FROM tenants WHERE slug='naturalshea')
INSERT INTO suppliers (tenant_id, code, name, contact_name, email, phone, currency, payment_terms_days)
SELECT t.id, code, name, contact, email, phone, 'GHS', terms FROM t, (VALUES
  ('SUP-0001','Tamale Shea Cooperative','Ama Mensah', 'ama@tamaleshea.coop', '+233244000111', 30),
  ('SUP-0002','West African Packaging', 'Kwaku Owusu','info@wa-pack.com',    '+233302000555', 45)
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
