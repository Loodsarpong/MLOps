import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { DbModule } from './db/db.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ProductsModule } from './modules/products/products.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { SalesModule } from './modules/sales/sales.module';
import { PosModule } from './modules/pos/pos.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { QuickBooksModule } from './modules/integrations/quickbooks/quickbooks.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TerminusModule,
    DbModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    CustomersModule,
    SuppliersModule,
    ProductsModule,
    WarehousesModule,
    InventoryModule,
    ProcurementModule,
    SalesModule,
    PosModule,
    InvoicingModule,
    PaymentsModule,
    PayrollModule,
    ReportsModule,
    NotificationsModule,
    AuditModule,
    QuickBooksModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
