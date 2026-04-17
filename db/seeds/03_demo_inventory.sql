-- 03_demo_inventory.sql — seed batches + stock for the NaturalShea demo tenant.
-- Idempotent-ish: only inserts if rows don't already exist for the batch_no.

DO $$
DECLARE
  v_tenant uuid;
  v_wh_factory uuid;
  v_wh_accra uuid;
  v_wh_kumasi uuid;
  v_sup_tamale uuid;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = 'naturalshea';

  SELECT id INTO v_wh_factory FROM warehouses
    WHERE tenant_id = v_tenant AND code = 'WH-TAMALE-FAC';
  SELECT id INTO v_wh_accra FROM warehouses
    WHERE tenant_id = v_tenant AND code = 'WH-ACCRA-DC';
  SELECT id INTO v_wh_kumasi FROM warehouses
    WHERE tenant_id = v_tenant AND code = 'WH-KUMASI-OUT';

  SELECT id INTO v_sup_tamale FROM suppliers
    WHERE tenant_id = v_tenant AND code = 'SUP-0001';

  -- One batch per product, manufactured 30d ago, expires 12 months out.
  INSERT INTO batches (tenant_id, product_id, batch_no, manufactured_on, expires_on, cost_price, supplier_id)
  SELECT v_tenant, p.id,
         'B-2026-' || p.sku,
         CURRENT_DATE - INTERVAL '30 days',
         CURRENT_DATE + INTERVAL '12 months',
         p.cost_price,
         v_sup_tamale
  FROM products p
  WHERE p.tenant_id = v_tenant
  ON CONFLICT (tenant_id, product_id, batch_no) DO NOTHING;

  -- Stock per product across warehouses.
  -- Factory: bulk production stock. Accra DC: distribution. Kumasi outlet: retail-ready.
  INSERT INTO inventory_stock (tenant_id, product_id, warehouse_id, batch_id, quantity, reorder_point)
  SELECT v_tenant, p.id, v_wh_factory, b.id, 500, 50
  FROM products p
  JOIN batches b ON b.product_id = p.id AND b.tenant_id = v_tenant
  WHERE p.tenant_id = v_tenant
  ON CONFLICT (tenant_id, product_id, warehouse_id, batch_id) DO NOTHING;

  INSERT INTO inventory_stock (tenant_id, product_id, warehouse_id, batch_id, quantity, reorder_point)
  SELECT v_tenant, p.id, v_wh_accra, b.id, 200, 25
  FROM products p
  JOIN batches b ON b.product_id = p.id AND b.tenant_id = v_tenant
  WHERE p.tenant_id = v_tenant
  ON CONFLICT (tenant_id, product_id, warehouse_id, batch_id) DO NOTHING;

  INSERT INTO inventory_stock (tenant_id, product_id, warehouse_id, batch_id, quantity, reorder_point)
  SELECT v_tenant, p.id, v_wh_kumasi, b.id, 60, 10
  FROM products p
  JOIN batches b ON b.product_id = p.id AND b.tenant_id = v_tenant
  WHERE p.tenant_id = v_tenant
  ON CONFLICT (tenant_id, product_id, warehouse_id, batch_id) DO NOTHING;

  -- Stock movements so reports aren't empty
  INSERT INTO stock_movements (tenant_id, product_id, warehouse_id, batch_id,
                               movement_type, quantity, unit_cost, reference_type)
  SELECT v_tenant, s.product_id, s.warehouse_id, s.batch_id,
         'receipt', s.quantity, p.cost_price, 'opening-balance'
  FROM inventory_stock s
  JOIN products p ON p.id = s.product_id
  WHERE s.tenant_id = v_tenant;
END $$;
