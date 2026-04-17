# Repository Structure

```
naturalshea-erp/
├── CLAUDE.md                        # AI-assistant instructions
├── README.md                        # Project overview (this repo)
├── package.json                     # pnpm workspace root
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
├── .editorconfig
├── .nvmrc
├── tsconfig.base.json
│
├── apps/
│   ├── api/                         # NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/              # Guards, interceptors, pipes, filters
│   │   │   │   ├── tenancy/         # Tenant-setter interceptor + context
│   │   │   │   ├── auth/            # JwtAuthGuard, RolesGuard, @Roles
│   │   │   │   ├── idempotency/     # Idempotency-Key middleware
│   │   │   │   ├── audit/           # AuditInterceptor
│   │   │   │   └── http/            # RFC 7807 error filter
│   │   │   ├── config/              # Env loader (zod-validated)
│   │   │   ├── db/                  # Kysely instance, migrations runner
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── tenants/
│   │   │   │   ├── users/
│   │   │   │   ├── customers/
│   │   │   │   ├── suppliers/
│   │   │   │   ├── products/
│   │   │   │   ├── inventory/
│   │   │   │   ├── procurement/
│   │   │   │   ├── sales/
│   │   │   │   ├── pos/
│   │   │   │   ├── invoicing/
│   │   │   │   ├── payments/
│   │   │   │   ├── payroll/
│   │   │   │   ├── reports/
│   │   │   │   ├── notifications/
│   │   │   │   ├── audit/
│   │   │   │   ├── integrations/
│   │   │   │   │   ├── quickbooks/
│   │   │   │   │   ├── ses/
│   │   │   │   │   └── twilio/
│   │   │   │   └── webhooks/
│   │   │   └── workers/             # SQS consumers + cron
│   │   ├── test/                    # e2e tests
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                         # Next.js PWA
│       ├── public/
│       │   ├── manifest.webmanifest
│       │   └── icons/
│       ├── src/
│       │   ├── app/                 # App Router
│       │   ├── components/
│       │   ├── features/
│       │   ├── lib/
│       │   ├── stores/
│       │   └── middleware.ts
│       ├── next.config.js
│       ├── tailwind.config.ts
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                      # Shared types, DTOs, zod schemas
│       ├── src/
│       │   ├── dto/
│       │   ├── enums/
│       │   └── index.ts
│       └── package.json
│
├── db/
│   ├── migrations/                  # Versioned SQL (run via node-pg-migrate)
│   │   ├── 0001_init.sql
│   │   ├── 0002_products_inventory.sql
│   │   ├── 0003_sales_invoicing.sql
│   │   ├── 0004_procurement_ap.sql
│   │   ├── 0005_payroll_audit.sql
│   │   └── 0006_rls_policies.sql
│   └── seeds/
│       ├── 01_roles.sql
│       └── 02_demo_tenant.sql
│
├── infra/
│   ├── terraform/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── providers.tf
│   │   ├── envs/
│   │   │   ├── dev.tfvars
│   │   │   ├── staging.tfvars
│   │   │   └── prod.tfvars
│   │   └── modules/
│   │       ├── network/
│   │       ├── rds/
│   │       ├── redis/
│   │       ├── ecs_service/
│   │       ├── s3_bucket/
│   │       ├── cognito/
│   │       └── cloudfront/
│   └── docker/
│       ├── docker-compose.yml       # local dev (pg + redis + minio)
│       ├── api.Dockerfile
│       └── web.Dockerfile
│
├── templates/
│   └── csv/
│       ├── products.csv
│       ├── stock.csv
│       ├── suppliers.csv
│       └── customers.csv
│
├── scripts/
│   ├── create-tenant.ts
│   ├── rotate-qbo-tokens.ts
│   └── generate-barcodes.ts
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── API.md
│   ├── FRONTEND.md
│   ├── QUICKBOOKS_INTEGRATION.md
│   ├── CSV_IMPORT.md
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   └── REPO_STRUCTURE.md
│
└── .github/
    ├── workflows/
    │   ├── ci.yml
    │   ├── deploy.yml
    │   └── security.yml
    ├── CODEOWNERS
    └── pull_request_template.md
```
