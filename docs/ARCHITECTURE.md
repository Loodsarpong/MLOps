# System Architecture

## 1. High-level diagram (logical)

```
                           ┌────────────────────────────────┐
                           │           End Users            │
                           │  (Admin · Accountant · Sales · │
                           │   Inventory · Outlet Cashier)  │
                           └───────────────┬────────────────┘
                                           │
                         HTTPS (TLS 1.3, HSTS)
                                           │
                 ┌─────────────────────────▼──────────────────────────┐
                 │                    AWS CloudFront                  │
                 │   (static assets, SW cache, signed URL invoices)   │
                 └──────┬────────────────────────────────┬────────────┘
                        │                                │
               /_next/* │                        api.*   │
                        ▼                                ▼
                 ┌────────────┐                  ┌────────────────┐
                 │ S3 (web)   │                  │  ALB (api)     │
                 │ Next.js    │                  │  WAF + ACM     │
                 │ PWA build  │                  └────────┬───────┘
                 └────────────┘                           │
                                                          ▼
                                   ┌──────────────────────────────────────┐
                                   │   ECS Fargate — service: naturalshea-api
                                   │   ┌──────────┐    ┌──────────────┐   │
                                   │   │ nest-api │…n  │ nest-worker  │…n │
                                   │   └────┬─────┘    └──────┬───────┘   │
                                   └────────┼─────────────────┼───────────┘
                                            │                 │
                 ┌──────────────────────────┼─────────────────┼────────────────────┐
                 │                          ▼                 ▼                    │
                 │               ┌────────────────┐   ┌──────────────┐             │
                 │               │ RDS Postgres15 │   │ ElastiCache  │             │
                 │               │ Multi-AZ, PITR │   │    Redis 7   │             │
                 │               └────────────────┘   └──────────────┘             │
                 │                          │                 │                    │
                 │                          ▼                 ▼                    │
                 │                   ┌────────────┐    ┌────────────┐              │
                 │                   │ S3 buckets │    │ SQS queues │              │
                 │                   │ invoices   │    │ qbo-sync   │              │
                 │                   │ imports    │    │ email-out  │              │
                 │                   │ backups    │    │ sms-out    │              │
                 │                   └────────────┘    └────────────┘              │
                 │                                                                 │
                 │   AWS Cognito (user pool, RBAC claims)                           │
                 │   AWS SES (transactional email)                                 │
                 │   AWS KMS (encryption keys)                                     │
                 │   CloudWatch + X-Ray (logs, metrics, traces)                    │
                 │   Secrets Manager (QBO tokens, Twilio creds, DB pwd)            │
                 └─────────────────────────────────────────────────────────────────┘

  External integrations:  QuickBooks Online API  ·  Twilio SMS  ·  Payment gateway
```

## 2. Deployment topology

| Concern        | Service                       | Notes                                 |
| -------------- | ----------------------------- | ------------------------------------- |
| Edge / CDN     | CloudFront + ACM              | Static web + signed URLs for S3 PDFs  |
| Web app        | S3 + Next.js static export or ECS for SSR pages | Split: marketing/auth SSR on ECS, dashboards hydrated on client |
| API            | ECS Fargate (2+ tasks, ALB)   | Autoscale on CPU & RPS                |
| Workers        | ECS Fargate (separate service)| Cron + SQS consumers                  |
| DB             | RDS Postgres 15, Multi-AZ     | `db.t4g.large` start; PITR 14 days    |
| Cache          | ElastiCache Redis, cluster mode off initially | Session + rate-limit + queue backplane |
| Queue          | SQS (+ optional EventBridge)  | Retry DLQ after 5 attempts            |
| Object storage | S3 (invoices, reports, imports, backups) | Versioned + SSE-KMS       |
| Auth           | Cognito user pool + identity pool | JWT with `tenant_id`, `roles` claims |
| Observability  | CloudWatch + X-Ray + Sentry   | JSON structured logs                  |
| Secrets        | AWS Secrets Manager           | Rotated QBO refresh tokens            |
| IaC            | Terraform (remote state in S3, locks in DynamoDB) | Per-env workspaces: `dev`, `staging`, `prod` |

## 3. Request lifecycle (example: POS checkout)

1. **Cashier** clicks `Charge` in offline-capable PWA.
2. If online, POST `/v1/pos/sales` with `Idempotency-Key` header.
3. NestJS `POSModule` opens a DB transaction:
   - validates inventory (FIFO/LIFO) per warehouse,
   - creates `sales_orders` + `order_items`,
   - decrements `inventory_stock` (batch-aware),
   - emits `invoice.create` + `qbo.sync` jobs to SQS,
   - writes `audit_logs` row.
4. 201 returned to the POS; receipt printed from cached PDF.
5. **Worker** consumes `invoice.create`: generates PDF → uploads to S3 → stores
   signed URL on the invoice row.
6. **QBO worker** consumes `qbo.sync`: maps invoice → QBO `Invoice` entity →
   writes `qbo_id` back + records sync status.
7. If **offline**, the PWA writes to IndexedDB via `idb-keyval`, flags the sale
   as `pendingSync`, and retries on reconnect using the same `Idempotency-Key`
   so the server dedupes.

## 4. Multi-tenant strategy

- **Single schema, row-level isolation.** Every tenant-owned table includes
  `tenant_id UUID NOT NULL`.
- Postgres **Row Level Security (RLS)** enforces isolation with a policy
  `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
- The API middleware reads `tenant_id` from the JWT and sets it per request:
  `SET LOCAL app.tenant_id = '...'`.
- Future path to per-tenant schemas or databases is reserved but not required
  for NaturalShea's scale.

## 5. Module boundaries (NestJS)

```
apps/api/src/
├── modules/
│   ├── auth/          # Cognito JWT verification, RBAC guards
│   ├── tenants/       # Tenant CRUD, subscription plan, feature flags
│   ├── users/         # Internal users, roles, invitations
│   ├── customers/     # CRM-lite, segments, loyalty
│   ├── suppliers/     # Supplier master, performance
│   ├── products/      # SKU, UPC, variants, pricing tiers
│   ├── inventory/     # Warehouses, stock, batches, adjustments, valuation
│   ├── procurement/   # POs, GRN, approvals
│   ├── sales/         # B2B/B2C orders, promotions, returns
│   ├── pos/           # POS sessions, offline sync, receipts
│   ├── invoicing/     # Invoices, recurring, PDF, QBO sync
│   ├── payments/      # AR/AP transactions, reconciliation
│   ├── payroll/       # Employees, runs, payslips
│   ├── reports/       # Materialized views + export
│   ├── notifications/ # Email (SES), SMS (Twilio), in-app
│   ├── audit/         # Audit log reader, immutable append-only writer
│   └── webhooks/      # QBO + payment gateway webhooks
├── workers/           # SQS consumers + scheduled jobs
├── common/            # Guards, interceptors, pipes, filters, tenancy
└── main.ts
```

## 6. Non-functional targets

| Metric                 | Target                              |
| ---------------------- | ----------------------------------- |
| API p95 latency        | < 300 ms (reads), < 700 ms (writes) |
| Availability           | 99.9 % monthly (multi-AZ)           |
| RPO / RTO              | 15 min / 1 hr                       |
| Backup retention       | 30 days PITR + 90 days S3 snapshots |
| Max concurrent POS     | 200 outlets, 1000 devices           |
| Offline POS duration   | 24 hours buffered                   |
