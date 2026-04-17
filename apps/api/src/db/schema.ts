// Kysely type definitions mapped from db/migrations. Excerpt — extend as needed.

import { Generated, ColumnType } from 'kysely';

type UUID = string;
type DateString = string;
type TimestampTz = ColumnType<Date, Date | string, Date | string>;
type Numeric = string;

export interface Database {
  tenants: TenantTable;
  users: UserTable;
  roles: RoleTable;
  user_roles: UserRoleTable;
  customers: CustomerTable;
  suppliers: SupplierTable;
  products: ProductTable;
  warehouses: WarehouseTable;
  batches: BatchTable;
  inventory_stock: StockTable;
  stock_movements: StockMovementTable;
  sales_orders: SalesOrderTable;
  sales_order_items: SalesOrderItemTable;
  invoices: InvoiceTable;
  invoice_lines: InvoiceLineTable;
  payments: PaymentTable;
  ar_transactions: ArTxnTable;
  purchase_orders: PurchaseOrderTable;
  po_items: PoItemTable;
  grn: GrnTable;
  grn_items: GrnItemTable;
  ap_transactions: ApTxnTable;
  approvals: ApprovalTable;
  employees: EmployeeTable;
  payroll_runs: PayrollRunTable;
  payslips: PayslipTable;
  audit_logs: AuditLogTable;
  notifications: NotificationTable;
  idempotency_keys: IdempotencyKeyTable;
  tenant_integrations: TenantIntegrationTable;
  pos_sessions: PosSessionTable;
}

export interface TenantTable {
  id: Generated<UUID>; name: string; slug: string;
  base_currency: string; timezone: string; plan: string; is_active: boolean;
  created_at: Generated<TimestampTz>; updated_at: Generated<TimestampTz>;
}

export interface UserTable {
  id: Generated<UUID>; tenant_id: UUID; cognito_sub: string | null; email: string;
  full_name: string; phone: string | null; is_active: boolean;
  last_login_at: TimestampTz | null;
  created_at: Generated<TimestampTz>; updated_at: Generated<TimestampTz>;
}

export interface RoleTable { id: Generated<UUID>; code: string; name: string; permissions: unknown; }
export interface UserRoleTable { user_id: UUID; role_id: UUID; }

export interface CustomerTable {
  id: Generated<UUID>; tenant_id: UUID; code: string; name: string;
  segment: 'retail'|'wholesale'|'distributor'|'online';
  email: string | null; phone: string | null;
  billing_address: unknown; shipping_address: unknown; tax_id: string | null;
  credit_limit: Numeric; currency: string; loyalty_points: number;
  is_active: boolean; qbo_customer_id: string | null;
  created_at: Generated<TimestampTz>; updated_at: Generated<TimestampTz>;
}

export interface SupplierTable {
  id: Generated<UUID>; tenant_id: UUID; code: string; name: string;
  contact_name: string | null; email: string | null; phone: string | null;
  address: unknown; payment_terms_days: number; currency: string;
  rating: Numeric | null; is_active: boolean; qbo_vendor_id: string | null;
  created_at: Generated<TimestampTz>; updated_at: Generated<TimestampTz>;
}

export interface ProductTable {
  id: Generated<UUID>; tenant_id: UUID; sku: string; upc: string | null;
  name: string; description: string | null; category: string | null; uom: string;
  is_raw_material: boolean; is_tracked_by_batch: boolean;
  tax_rate_pct: Numeric; cost_price: Numeric; base_price: Numeric;
  currency: string; weight_grams: number | null; is_active: boolean;
  qbo_item_id: string | null;
  created_at: Generated<TimestampTz>; updated_at: Generated<TimestampTz>;
}

export interface WarehouseTable {
  id: Generated<UUID>; tenant_id: UUID; code: string; name: string;
  type: string; address: unknown; is_active: boolean;
}

export interface BatchTable {
  id: Generated<UUID>; tenant_id: UUID; product_id: UUID; batch_no: string;
  manufactured_on: DateString | null; expires_on: DateString | null;
  cost_price: Numeric; supplier_id: UUID | null; notes: string | null;
  created_at: Generated<TimestampTz>;
}

export interface StockTable {
  id: Generated<UUID>; tenant_id: UUID; product_id: UUID; warehouse_id: UUID;
  batch_id: UUID | null; quantity: Numeric; reserved: Numeric;
  reorder_point: Numeric | null; updated_at: Generated<TimestampTz>;
}

export interface StockMovementTable {
  id: Generated<UUID>; tenant_id: UUID; product_id: UUID; warehouse_id: UUID;
  batch_id: UUID | null; movement_type: string; quantity: Numeric;
  unit_cost: Numeric | null; reference_type: string | null; reference_id: UUID | null;
  performed_by: UUID | null; created_at: Generated<TimestampTz>;
}

export interface SalesOrderTable {
  id: Generated<UUID>; tenant_id: UUID; order_no: string;
  customer_id: UUID | null; warehouse_id: UUID; channel: string;
  status: 'draft'|'confirmed'|'picked'|'shipped'|'delivered'|'cancelled'|'returned';
  currency: string; fx_rate: Numeric;
  subtotal: Numeric; discount_total: Numeric; tax_total: Numeric; total: Numeric;
  notes: string | null; created_by: UUID | null;
  created_at: Generated<TimestampTz>; updated_at: Generated<TimestampTz>;
}

export interface SalesOrderItemTable {
  id: Generated<UUID>; tenant_id: UUID; order_id: UUID; product_id: UUID;
  batch_id: UUID | null; quantity: Numeric; unit_price: Numeric;
  discount_pct: Numeric; tax_pct: Numeric; line_total: Numeric;
}

export interface InvoiceTable {
  id: Generated<UUID>; tenant_id: UUID; invoice_no: string;
  order_id: UUID | null; customer_id: UUID; issue_date: DateString; due_date: DateString;
  currency: string; fx_rate: Numeric;
  subtotal: Numeric; tax_total: Numeric; total: Numeric;
  amount_paid: Numeric; balance_due: Numeric;
  status: 'draft'|'issued'|'partial'|'paid'|'overdue'|'void';
  pdf_s3_key: string | null; recurring_rule: unknown;
  qbo_invoice_id: string | null; qbo_sync_status: string | null;
  qbo_last_sync_at: TimestampTz | null;
  created_at: Generated<TimestampTz>; updated_at: Generated<TimestampTz>;
}

export interface InvoiceLineTable {
  id: Generated<UUID>; tenant_id: UUID; invoice_id: UUID; product_id: UUID | null;
  description: string; quantity: Numeric; unit_price: Numeric;
  tax_pct: Numeric; line_total: Numeric;
}

export interface PaymentTable {
  id: Generated<UUID>; tenant_id: UUID; invoice_id: UUID | null; customer_id: UUID | null;
  amount: Numeric; currency: string;
  method: 'cash'|'card'|'mobile_money'|'bank_transfer'|'cheque'|'credit';
  reference: string | null; received_at: Generated<TimestampTz>; recorded_by: UUID | null;
}

export interface ArTxnTable {
  id: Generated<UUID>; tenant_id: UUID; customer_id: UUID;
  invoice_id: UUID | null; payment_id: UUID | null;
  txn_type: string; amount: Numeric; currency: string;
  occurred_at: Generated<TimestampTz>;
}

export interface PurchaseOrderTable {
  id: Generated<UUID>; tenant_id: UUID; po_no: string;
  supplier_id: UUID; warehouse_id: UUID;
  status: 'draft'|'approved'|'sent'|'partial'|'received'|'closed'|'cancelled';
  currency: string; subtotal: Numeric; tax_total: Numeric; total: Numeric;
  expected_date: DateString | null;
  approved_by: UUID | null; approved_at: TimestampTz | null;
  created_by: UUID | null;
  created_at: Generated<TimestampTz>; updated_at: Generated<TimestampTz>;
}
export interface PoItemTable {
  id: Generated<UUID>; tenant_id: UUID; po_id: UUID; product_id: UUID;
  quantity: Numeric; received_qty: Numeric; unit_cost: Numeric;
  tax_pct: Numeric; line_total: Numeric;
}
export interface GrnTable {
  id: Generated<UUID>; tenant_id: UUID; po_id: UUID; grn_no: string;
  received_at: Generated<TimestampTz>; received_by: UUID | null;
}
export interface GrnItemTable {
  id: Generated<UUID>; tenant_id: UUID; grn_id: UUID; po_item_id: UUID;
  batch_id: UUID | null; quantity: Numeric; unit_cost: Numeric;
}
export interface ApTxnTable {
  id: Generated<UUID>; tenant_id: UUID; supplier_id: UUID; po_id: UUID | null;
  txn_type: string; amount: Numeric; currency: string;
  due_date: DateString | null; paid_at: TimestampTz | null;
  expense_category: string | null; occurred_at: Generated<TimestampTz>;
}
export interface ApprovalTable {
  id: Generated<UUID>; tenant_id: UUID; entity_type: string; entity_id: UUID;
  requested_by: UUID | null; approved_by: UUID | null;
  status: string; comment: string | null;
  requested_at: Generated<TimestampTz>; resolved_at: TimestampTz | null;
}

export interface EmployeeTable {
  id: Generated<UUID>; tenant_id: UUID; code: string; full_name: string;
  email: string | null; department: string | null; position: string | null;
  base_salary: Numeric; currency: string;
  hired_on: DateString; terminated_on: DateString | null; bank_details: unknown;
}
export interface PayrollRunTable {
  id: Generated<UUID>; tenant_id: UUID; period_start: DateString; period_end: DateString;
  status: string; total_gross: Numeric; total_net: Numeric;
  approved_by: UUID | null; approved_at: TimestampTz | null;
  created_at: Generated<TimestampTz>;
}
export interface PayslipTable {
  id: Generated<UUID>; tenant_id: UUID; run_id: UUID; employee_id: UUID;
  gross: Numeric; tax: Numeric; deductions: Numeric; net: Numeric;
  pdf_s3_key: string | null;
}

export interface AuditLogTable {
  id: Generated<number>; tenant_id: UUID; actor_id: UUID | null;
  action: string; entity_type: string; entity_id: UUID | null;
  before_state: unknown; after_state: unknown;
  ip_address: string | null; user_agent: string | null;
  created_at: Generated<TimestampTz>;
}

export interface NotificationTable {
  id: Generated<UUID>; tenant_id: UUID; user_id: UUID | null;
  channel: string; topic: string; payload: unknown;
  read_at: TimestampTz | null; sent_at: TimestampTz | null;
  created_at: Generated<TimestampTz>;
}

export interface IdempotencyKeyTable {
  id: Generated<UUID>; tenant_id: UUID; key: string; request_hash: string;
  response_status: number | null; response_body: unknown;
  created_at: Generated<TimestampTz>; expires_at: Generated<TimestampTz>;
}

export interface TenantIntegrationTable {
  tenant_id: UUID; provider: string; status: string; config: unknown;
  secret_arn: string | null; connected_at: TimestampTz | null;
  last_error: string | null;
}

export interface PosSessionTable {
  id: Generated<UUID>; tenant_id: UUID; warehouse_id: UUID; cashier_id: UUID;
  opened_at: Generated<TimestampTz>; closed_at: TimestampTz | null;
  opening_cash: Numeric; closing_cash: Numeric | null;
  expected_cash: Numeric | null; variance: Numeric | null; notes: string | null;
}
