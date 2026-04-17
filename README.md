# NaturalShea Care — ERP System

Production-ready, multi-tenant ERP for **NaturalShea Care**, a manufacturer,
wholesaler, and distributor of shea-based personal-care products. The platform
covers the full business cycle: procurement of raw shea, batch-tracked
manufacturing, multi-warehouse inventory, omnichannel sales (POS / B2B / B2C),
invoicing with QuickBooks Online sync, AR/AP, payroll, CRM, and analytics.

> **Business context.** NaturalShea Care sources unrefined shea butter from
> cooperatives in Northern Ghana, refines and blends it into finished SKUs
> (body butters, balms, soaps, haircare), and distributes to retailers in West
> Africa, the EU, and North America. The ERP must handle:
>
> - **Batch & expiry tracking** (cosmetic regulation requires lot traceability).
> - **Multi-currency** (GHS, USD, EUR, GBP) with FX rates.
> - **Multi-warehouse** (factory, regional DCs, retail outlets).
> - **Wholesale pricing tiers + retail POS** in the same system.
> - **Offline-capable POS** for outlets with intermittent connectivity.

---

## Table of Contents

1. [Architecture](docs/ARCHITECTURE.md)
2. [Database schema](docs/DATABASE_SCHEMA.md)
3. [REST API reference](docs/API.md)
4. [Frontend structure](docs/FRONTEND.md)
5. [QuickBooks integration](docs/QUICKBOOKS_INTEGRATION.md)
6. [CSV import formats](docs/CSV_IMPORT.md)
7. [AWS deployment](docs/DEPLOYMENT.md)
8. [Security & RBAC](docs/SECURITY.md)
9. [Repository layout](docs/REPO_STRUCTURE.md)

## Quick start (local dev)

```bash
# 1. Clone + bootstrap
git clone https://github.com/loodsarpong/mlops.git naturalshea-erp
cd naturalshea-erp
cp .env.example .env

# 2. Start dependencies (Postgres + Redis) via Docker
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Install + migrate + seed
pnpm install
pnpm --filter @ns/api migrate
pnpm --filter @ns/api seed

# 4. Run services (separate terminals)
pnpm --filter @ns/api dev       # http://localhost:4000
pnpm --filter @ns/web dev       # http://localhost:3000
```

Default login after seeding: `admin@naturalshea.care` / `ChangeMe!123`.

## Tech stack at a glance

| Layer          | Choice                                     |
| -------------- | ------------------------------------------ |
| Frontend       | Next.js 14 (App Router), React 18, Tailwind, PWA (next-pwa) |
| Backend        | NestJS 10, TypeScript, REST + optional GraphQL |
| Database       | PostgreSQL 15 (Amazon RDS)                 |
| Cache/Sessions | Redis 7 (Amazon ElastiCache)               |
| Auth           | AWS Cognito + JWT                          |
| File storage   | Amazon S3 (invoices, reports, imports)     |
| CDN            | CloudFront                                 |
| Compute        | ECS Fargate (api + worker), CloudFront+S3 (web) |
| IaC            | Terraform                                  |
| CI/CD          | GitHub Actions                             |
| Integrations   | QuickBooks Online, SES, Twilio             |

## Repository layout

```
naturalshea-erp/
├── apps/
│   ├── api/        # NestJS backend (REST API, workers, QuickBooks sync)
│   └── web/        # Next.js 14 PWA (admin, POS, dashboards)
├── packages/
│   └── shared/     # Shared TypeScript types, DTOs, zod schemas
├── db/
│   ├── migrations/ # Versioned SQL migrations (pgTyped-compatible)
│   └── seeds/      # Seed data (roles, tax codes, sample tenant)
├── infra/
│   ├── terraform/  # AWS infrastructure (VPC, ECS, RDS, S3, Cognito)
│   └── docker/     # Dockerfiles + compose for local dev
├── templates/csv/  # Importable CSV templates (products, stock, suppliers, ...)
├── docs/           # Architecture, API, deployment documentation
├── scripts/        # One-off ops scripts
└── .github/workflows/
```

See [docs/REPO_STRUCTURE.md](docs/REPO_STRUCTURE.md) for a file-level tour.

## License

Proprietary — © NaturalShea Care. All rights reserved.
