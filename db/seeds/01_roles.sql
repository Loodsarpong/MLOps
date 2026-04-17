-- 01_roles.sql — canonical role definitions

INSERT INTO roles (code, name, permissions) VALUES
  ('admin',             'Administrator',       '["*"]'::jsonb),
  ('accountant',        'Accountant',          '["customers:read","invoices:issue","invoices:void","payments:record","ap:*","ar:*","reports:read","audit:read","integrations:quickbooks"]'::jsonb),
  ('sales_rep',         'Sales Representative','["customers:read","customers:write","products:read","sales:create","invoices:issue","reports:read"]'::jsonb),
  ('inventory_manager', 'Inventory Manager',   '["products:read","products:write","inventory:*","procurement:create","suppliers:*","reports:read"]'::jsonb),
  ('cashier',           'Cashier',             '["products:read","pos:checkout","sales:create","payments:record"]'::jsonb),
  ('viewer',            'Viewer',              '["customers:read","products:read","inventory:read","reports:read"]'::jsonb)
ON CONFLICT (code) DO NOTHING;
