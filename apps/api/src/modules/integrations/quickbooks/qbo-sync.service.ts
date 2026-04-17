import { Inject, Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../../db/schema';
import { KYSELY } from '../../../db/db.module';
import { QboAuthService } from './qbo-auth.service';

/**
 * Outbound sync: ERP → QuickBooks.
 * Minimal viable implementation — worker calls `syncInvoice(tenantId, invoiceId)`
 * from an SQS consumer. Handles customer + item upsert before invoice.
 */
@Injectable()
export class QboSyncService {
  private readonly log = new Logger(QboSyncService.name);
  private readonly BASE = 'https://quickbooks.api.intuit.com/v3/company';

  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    private readonly auth: QboAuthService,
  ) {}

  async syncInvoice(tenantId: string, invoiceId: string): Promise<string> {
    const { token, realmId } = await this.auth.getAccessToken(tenantId);
    const inv = await this.db
      .selectFrom('invoices')
      .selectAll()
      .where('id', '=', invoiceId)
      .executeTakeFirstOrThrow();
    const lines = await this.db
      .selectFrom('invoice_lines')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .execute();
    const cust = await this.ensureCustomer(tenantId, inv.customer_id, realmId, token);

    const body = {
      CustomerRef: { value: cust },
      DueDate: inv.due_date,
      TxnDate: inv.issue_date,
      CurrencyRef: { value: inv.currency },
      Line: lines.map((l, idx) => ({
        Id: String(idx + 1),
        DetailType: 'SalesItemLineDetail',
        Amount: Number(l.line_total),
        Description: l.description,
        SalesItemLineDetail: {
          Qty: Number(l.quantity),
          UnitPrice: Number(l.unit_price),
          TaxCodeRef: { value: Number(l.tax_pct) > 0 ? 'TAX' : 'NON' },
        },
      })),
    };

    const r = await this.call(realmId, token, 'invoice', 'POST', body) as any;
    const qboId = r.Invoice?.Id ?? r.Id;
    await this.db
      .updateTable('invoices')
      .set({
        qbo_invoice_id: qboId,
        qbo_sync_status: 'synced',
        qbo_last_sync_at: new Date(),
      })
      .where('id', '=', invoiceId)
      .execute();
    return qboId;
  }

  private async ensureCustomer(
    tenantId: string,
    customerId: string,
    realmId: string,
    token: string,
  ): Promise<string> {
    const c = await this.db
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', customerId)
      .executeTakeFirstOrThrow();
    if (c.qbo_customer_id) return c.qbo_customer_id;

    const r = await this.call(realmId, token, 'customer', 'POST', {
      DisplayName: c.name,
      PrimaryEmailAddr: c.email ? { Address: c.email } : undefined,
      PrimaryPhone: c.phone ? { FreeFormNumber: c.phone } : undefined,
    }) as any;
    const id = r.Customer?.Id ?? r.Id;
    await this.db
      .updateTable('customers')
      .set({ qbo_customer_id: id })
      .where('id', '=', customerId)
      .execute();
    return id;
  }

  private async call(
    realmId: string,
    token: string,
    entity: string,
    method: 'GET' | 'POST',
    body?: unknown,
    attempt = 1,
  ): Promise<Record<string, unknown>> {
    const url = `${this.BASE}/${realmId}/${entity}?minorversion=70`;
    const r = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429 && attempt < 5) {
      const retry = Number(r.headers.get('Retry-After') ?? '2');
      await new Promise((res) => setTimeout(res, retry * 1000));
      return this.call(realmId, token, entity, method, body, attempt + 1);
    }
    if (!r.ok) throw new Error(`QBO ${entity} ${method} -> ${r.status} ${await r.text()}`);
    return r.json();
  }
}
