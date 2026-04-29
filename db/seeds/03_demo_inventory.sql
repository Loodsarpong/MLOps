-- 03_demo_inventory.sql — seed batches + stock for the NaturalShea demo tenant.
-- Single warehouse: Brendamour Blue Ash DC (WH-BLUEASH).

DO $$
DECLARE
  v_tenant uuid;
  v_wh_blueash uuid;
  v_sup uuid;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = 'naturalshea';

  SELECT id INTO v_wh_blueash FROM warehouses
    WHERE tenant_id = v_tenant AND code = 'WH-BLUEASH';

  SELECT id INTO v_sup FROM suppliers
    WHERE tenant_id = v_tenant AND code = 'SUP-0001';

  -- One batch per product, manufactured 30d ago, expires 12 months out.
  INSERT INTO batches (tenant_id, product_id, batch_no, manufactured_on, expires_on, cost_price, supplier_id)
  SELECT v_tenant, p.id,
         'B-2026-' || p.sku,
         CURRENT_DATE - INTERVAL '30 days',
         CURRENT_DATE + INTERVAL '12 months',
         p.cost_price,
         v_sup
  FROM products p
  WHERE p.tenant_id = v_tenant
  ON CONFLICT (tenant_id, product_id, batch_no) DO NOTHING;

  -- Stock at the single distribution center.
  INSERT INTO inventory_stock (tenant_id, product_id, warehouse_id, batch_id, quantity, reorder_point)
  SELECT v_tenant, p.id, v_wh_blueash, b.id, 500, 50
  FROM products p
  JOIN batches b ON b.product_id = p.id AND b.tenant_id = v_tenant
  WHERE p.tenant_id = v_tenant
  ON CONFLICT (tenant_id, product_id, warehouse_id, batch_id) DO NOTHING;

  -- Stock movements so reports aren't empty.
  INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, batch_id,
                               movement_type, quantity, unit_cost, reference_type)
  SELECT v_tenant, s.product_id, s.warehouse_id, s.batch_id,
         'receipt', s.quantity, p.cost_price, 'opening-balance'
  FROM inventory_stock s
  JOIN products p ON p.id = s.product_id
  WHERE s.tenant_id = v_tenant;
END $$;
