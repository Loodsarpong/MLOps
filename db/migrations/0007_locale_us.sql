-- 0007_locale_us.sql — flip default currency/timezone from GHS/Africa/Accra to USD/America/New_York.
-- Idempotent: only changes column defaults; existing rows are migrated by an UPDATE for the demo tenant.

ALTER TABLE tenants     ALTER COLUMN base_currency SET DEFAULT 'USD';
ALTER TABLE tenants     ALTER COLUMN timezone      SET DEFAULT 'America/New_York';
ALTER TABLE customers   ALTER COLUMN currency      SET DEFAULT 'USD';
ALTER TABLE suppliers   ALTER COLUMN currency      SET DEFAULT 'USD';
ALTER TABLE products    ALTER COLUMN currency      SET DEFAULT 'USD';
ALTER TABLE price_tiers ALTER COLUMN currency      SET DEFAULT 'USD';
ALTER TABLE sales_orders ALTER COLUMN currency     SET DEFAULT 'USD';

-- Re-home any demo tenant left over from earlier seeds.
UPDATE tenants
   SET base_currency = 'USD',
       timezone      = 'America/New_York'
 WHERE slug = 'naturalshea';

UPDATE customers   SET currency = 'USD' WHERE currency = 'GHS';
UPDATE suppliers   SET currency = 'USD' WHERE currency = 'GHS';
UPDATE products    SET currency = 'USD' WHERE currency = 'GHS';
UPDATE price_tiers SET currency = 'USD' WHERE currency = 'GHS';
UPDATE sales_orders SET currency = 'USD' WHERE currency = 'GHS';
UPDATE invoices    SET currency = 'USD' WHERE currency = 'GHS';
UPDATE payments    SET currency = 'USD' WHERE currency = 'GHS';
UPDATE ar_transactions SET currency = 'USD' WHERE currency = 'GHS';
