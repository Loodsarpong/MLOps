# QuickBooks Online Integration

Bidirectional sync of customers, vendors, items, invoices, bills, and payments
between NaturalShea ERP and QuickBooks Online via the QBO REST API v3.

## 1. OAuth 2.0 connection

1. Admin clicks **Connect QuickBooks** on `/settings/integrations/quickbooks`.
2. Frontend redirects to `https://appcenter.intuit.com/connect/oauth2` with
   `client_id`, `scope=com.intuit.quickbooks.accounting`,
   `state=<tenant_id>:<nonce>`, `redirect_uri=<api>/webhooks/quickbooks/callback`.
3. API callback exchanges the `code` for `access_token` (1 hr) and
   `refresh_token` (100 days). Tokens are stored encrypted in
   AWS Secrets Manager under `qbo/<tenant_id>`; the `realmId` is stored in
   `tenant_integrations`.
4. A cron worker refreshes the access token every 45 minutes.

```ts
// apps/api/src/modules/integrations/quickbooks/qbo-auth.service.ts
async exchange(code: string, realmId: string, tenantId: string) {
  const resp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + basic(this.cfg.clientId, this.cfg.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cfg.redirectUri,
    }),
  }).then(r => r.json());
  await this.secrets.put(`qbo/${tenantId}`, {
    access_token: resp.access_token,
    refresh_token: resp.refresh_token,
    realm_id: realmId,
    access_expires_at: Date.now() + resp.expires_in * 1000,
  });
}
```

## 2. Entity mapping

| ERP entity              | QBO entity       | Notes                                         |
| ----------------------- | ---------------- | --------------------------------------------- |
| `tenants`               | Company          | Realm per tenant                              |
| `customers`             | `Customer`       | `qbo_customer_id` stored back on ERP row      |
| `suppliers`             | `Vendor`         | `qbo_vendor_id`                               |
| `products`              | `Item` (Inventory or NonInventory) | Match by SKU           |
| `invoices`              | `Invoice`        | Include tax lines; email flag optional        |
| `payments`              | `Payment`        | Linked to invoice `LinkedTxn`                 |
| `ap_transactions` (bill)| `Bill`           | Category → QBO expense account                |
| `ap_transactions` (pay) | `BillPayment`    |                                               |

## 3. Sync flow

### 3.1 Outbound (ERP → QBO)

```
[Invoice created in ERP]
      │
      ▼
[DB trigger / event]  ──▶  SQS qbo-sync   ──▶  [qbo-sync worker]
                                                      │
                                                      ▼
                                  1. ensure Customer exists (upsert by email/ref)
                                  2. ensure each Item exists (by SKU)
                                  3. POST /v3/company/{realm}/invoice
                                  4. store qbo_invoice_id + qbo_sync_status='synced'
                                  5. on failure → exponential backoff (max 5 retries) → DLQ
```

### 3.2 Inbound (QBO → ERP)

QBO sends webhook notifications to `/webhooks/quickbooks` with a signed HMAC
header (`intuit-signature`). The handler verifies signature, then for each
entity event (`CREATE|UPDATE|DELETE`) enqueues `qbo-inbound` and the worker
pulls the entity via `/v3/company/{realm}/{entity}/{id}` and upserts locally.

Webhook payload (excerpt):
```json
{
  "eventNotifications": [{
    "realmId": "123146157914442",
    "dataChangeEvent": {
      "entities": [
        { "name": "Invoice",  "id": "5059", "operation": "Update", "lastUpdated": "2026-04-17T09:20:11Z" },
        { "name": "Customer", "id": "42",   "operation": "Create", "lastUpdated": "2026-04-17T09:20:10Z" }
      ]
    }
  }]
}
```

## 4. Conflict resolution

- **Last-write-wins** by `lastUpdated` timestamp for most entities.
- **Invoice** is an exception: once `status='paid'` in either system, the ERP
  refuses overwrite of monetary fields and surfaces a conflict in
  `/settings/integrations/quickbooks/conflicts` for manual review.
- Deletions in QBO **soft-delete** on ERP (`is_active=false`) to preserve
  history; never cascade.

## 5. Error handling & observability

- All QBO API calls are wrapped with `qbo.requestDuration` histogram and
  `qbo.requestErrors{status}` counter.
- 401 → refresh access token and retry once.
- 429 → honor `Retry-After`; do not count toward failure budget.
- Token refresh failures alert on PagerDuty (`qbo_auth_failure`).

## 6. Rate limits

- QBO sandbox: 500 req/min per realm; production: 500 req/min.
- Worker concurrency: 4 per tenant (sufficient for < 2k invoices/day).
- Daily reconciliation job compares aggregates (count + sum) per entity and
  files a reconciliation report to `s3://ns-reports/qbo-reconciliation/`.

## 7. Manual sync UI

- `/settings/integrations/quickbooks` shows: last sync at, health, 7-day error
  rate, entity counters, and a **Re-sync** button per entity.
- Per-invoice **Force sync** button on invoice detail page (admins only).
