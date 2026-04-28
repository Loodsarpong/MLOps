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

## Quick start (local dev, macOS)

Prereqs: install **Homebrew**, **Docker Desktop** (and start it), **Node 20**, and **pnpm 9**.

```bash
brew install node@20 pnpm
brew install --cask docker   # then open Docker Desktop once
```

Then, from the repo root:

```bash
git clone https://github.com/loodsarpong/MLOps.git naturalshea-erp
cd naturalshea-erp

# Bootstrap: prereq check + .env + Postgres/Redis/MinIO via docker compose
make setup

# Install + migrate + seed (Brendamour Blue Ash DC, demo tenant, roles)
make install
make db

# Run the API and Web in two terminals
make api      # http://localhost:4000
make web      # http://localhost:3000
```

Sign in at http://localhost:3000 with the dev backdoor:

- email: `lsarpong@naturalsheacare.com`
- password: `dev-password`

Run `make help` to see all targets (`reset`, `test`, `lint`, `logs`, …).

> Without `make`, the equivalent scripts are documented in
> [`scripts/dev-setup.sh`](scripts/dev-setup.sh) and the per-package `pnpm`
> commands listed in `apps/api/package.json` and `apps/web/package.json`.

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
