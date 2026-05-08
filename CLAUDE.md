# CLAUDE.md — NaturalShea Care ERP

Context for AI assistants working in this repository. Update this file as the
project evolves.

> **Repo name vs. project.** The GitHub remote is `Loodsarpong/MLOps` for
> historical reasons. The actual project is the **NaturalShea Care ERP** —
> a multi-tenant TypeScript monorepo. There is no ML / MLOps code here.

---

## Project overview

Production-track ERP for NaturalShea Care, a US-based shea-product
manufacturer / distributor (Brendamour DC, Blue Ash). Covers product catalog,
multi-warehouse inventory with FIFO batch tracking, in-store POS (offline-
capable PWA), customers, suppliers, invoicing, procurement, and a planned
QuickBooks Online sync.

For a deep dive on current state, what is shipped, and what is pending, read
[`docs/HANDOVER.md`](docs/HANDOVER.md) first.

---

## Tech stack

| Layer        | Choice                                                            |
| ------------ | ----------------------------------------------------------------- |
| Runtime      | Node 20, pnpm 9, TypeScript 5                                     |
| Backend      | NestJS 10 (REST), Kysely + `pg` for SQL, Zod for validation       |
| Frontend     | Next.js 14 (App Router), React 18, Tailwind, `next-pwa`           |
| Frontend libs| TanStack Query, Zustand, react-hook-form, sonner, recharts, idb-keyval |
| Database     | PostgreSQL 15 with row-level security                             |
| Cache / Queue| Redis 7 (BullMQ planned)                                          |
| Auth         | Argon2 passwords + JWT; AWS Cognito (target state); dev backdoor (local) |
| Object store | S3 in prod, MinIO locally                                         |
| Migrations   | `node-pg-migrate` against `db/migrations/*.sql`                   |
| Tests        | `vitest` per package                                              |
| Lint         | `eslint` per package                                              |
| CI/CD        | GitHub Actions (`.github/workflows/{ci,deploy,security}.yml`)     |
| Infra        | Terraform under `infra/terraform/` (modules: network, rds, redis, ecs_service, s3_bucket, cloudfront, cognito) |
| Container    | Docker Compose locally; ECS Fargate target                        |

---

## Repository structure

```
naturalshea-erp/                    # repo root (folder is named MLOps locally)
├── CLAUDE.md                       # this file
├── README.md                       # human-facing overview + quick start
├── Makefile                        # dev convenience targets (`make help`)
├── pnpm-workspace.yaml             # workspace = apps/* + packages/*
├── apps/
│   ├── api/                        # NestJS backend
│   │   └── src/
│   │       ├── main.ts             # bootstrap (helmet, CORS, validation)
│   │       ├── app.module.ts       # canonical module list
│   │       ├── health.controller.ts
│   │       ├── common/             # auth, tenancy (RLS), audit, http, idempotency
│   │       ├── config/
│   │       ├── db/                 # Kysely + pg setup; tenant-scoped queries
│   │       ├── modules/            # 19 feature modules (auth, products, pos, ...)
│   │       ├── scripts/            # one-off scripts (e.g. set-password)
│   │       └── workers/            # SQS / queue workers
│   └── web/                        # Next.js 14 PWA
│       └── src/
│           ├── app/(app)/          # authed app: dashboard, pos, products, ...
│           ├── app/(auth)/         # login, change-password
│           ├── components/layout/
│           ├── lib/                # api client, auth, offline sync hooks
│           ├── stores/             # zustand stores (cart, ...)
│           └── middleware.ts       # auth-cookie gate
├── packages/
│   └── shared/                     # shared types, DTOs, zod schemas
├── db/
│   ├── migrations/                 # numbered SQL (0001…0010 currently)
│   └── seeds/                      # 01_roles, 02_demo_tenant, 03_demo_inventory
├── infra/
│   ├── docker/                     # docker-compose + api/web Dockerfiles
│   └── terraform/                  # AWS modules + dev/staging/prod tfvars
├── templates/csv/                  # CSV import templates
├── docs/                           # architecture, schema, api, deploy, runbook, …
├── scripts/                        # dev-setup.sh, create-tenant.ts
└── .github/workflows/              # ci.yml, deploy.yml, security.yml
```

---

## Development environment

### Prerequisites

- Node 20
- pnpm 9
- Docker Desktop (or compatible Docker Engine)
- `make`

### Setup

```bash
make setup        # prereq check + .env from .env.example + start docker compose
make install      # pnpm install --frozen-lockfile
make db           # migrate + seed + bootstrap demo admin password
make api          # NestJS dev (http://localhost:4000)  — run in its own terminal
make web          # Next.js dev (http://localhost:3000) — run in its own terminal
```

Sign in (local dev only):

- Email: `lsarpong@naturalsheacare.com`
- Password: `dev-password`

---

## Common commands (Makefile)

`make help` is the source of truth. Highlights:

| Command                                       | Description                                         |
| --------------------------------------------- | --------------------------------------------------- |
| `make setup`                                  | First-time bootstrap (prereqs, `.env`, docker up)   |
| `make install`                                | `pnpm install --frozen-lockfile`                    |
| `make db`                                     | `migrate` + `seed` + bootstrap demo admin password  |
| `make migrate`                                | Apply DB migrations (loads `.env`)                  |
| `make seed`                                   | Run seed SQL via the Postgres container             |
| `make api` / `make web` / `make worker`       | Run each service in dev mode                        |
| `make down`                                   | Stop docker services (keeps volumes)                |
| `make reset`                                  | DESTRUCTIVE: wipe DB volume, restart, re-migrate, re-seed |
| `make test`                                   | `pnpm -r test` (vitest)                             |
| `make lint`                                   | `pnpm -r lint`                                      |
| `make logs`                                   | Tail docker compose logs                            |
| `make admin-password EMAIL=… PASSWORD=…`      | Set/reset a user password (uses `ts-node`)          |

---

## Code conventions

### TypeScript

- Per-package `tsconfig.json` extending `tsconfig.base.json`.
- Strict-ish; some `apps/api` strictness has been intentionally loosened —
  tighten as you touch modules, do not loosen further.
- Imports: stdlib → third-party → local; let eslint sort.

### Linting & formatting

- `eslint` per package (`apps/api/.eslintrc.cjs`, `apps/web/.eslintrc.json`).
- No project-wide formatter is enforced; match surrounding style.

### Naming

| Construct          | Convention          | Example                |
| ------------------ | ------------------- | ---------------------- |
| Files / modules    | `kebab-case` or `dot.case` per Nest convention | `products.service.ts`, `set-password.ts` |
| Classes            | `PascalCase`        | `ProductsController`   |
| Functions / vars   | `camelCase`         | `findActiveTenant()`   |
| Constants          | `UPPER_SNAKE_CASE`  | `MAX_BATCH_SIZE`       |
| DB columns         | `snake_case`        | `tenant_id`            |

### Database

- Migrations are numbered SQL in `db/migrations/`. **Never edit a merged
  migration; add a new one.**
- All tenant-scoped tables use Postgres RLS. Tenant context is injected per
  request via `set_config('app.tenant_id', ...)` — see
  `apps/api/src/common/tenancy/`. Any new query path must go through the
  shared `Db` provider so RLS is set; otherwise it will silently filter to
  nothing.
- Migration `0009_relax_force_rls.sql` removes `FORCE` from RLS so admin
  reads work without a tenant. Do not re-add `FORCE` without revisiting the
  consumers.

---

## Testing

```bash
pnpm -r test                                    # all packages
pnpm --filter @ns/api test                      # API unit tests
pnpm --filter @ns/web test                      # Web unit tests
pnpm --filter @ns/api exec vitest run path/x    # single file
```

- Vitest with `--passWithNoTests` is allowed today (some modules have no
  suite yet). When you add a module, add at least a smoke test.
- Mock external services (SES, Twilio, QBO, S3) in unit tests.
- E2E target (`test:e2e`) exists in `apps/api/package.json` but has no real
  suite.

---

## Git workflow

### Branching

- `main` — integration / production-track. No direct pushes.
- `feature/<slug>` — feature branches.
- `fix/<slug>` — bug fix branches.
- `claude/<session-id>` — AI-assistant branches (this convention is real and
  enforced by tooling — match it exactly).

### Commit messages — Conventional Commits

```
<type>(<scope>): <short summary>
```

Types in active use: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`,
`ci`, `perf`. Recent history is a good reference.

### Pull requests

- Describe **what** changed and **why**.
- All CI must pass. CI runs lint + build + migrations + unit tests against a
  Postgres + Redis service container.
- Do **not** open a PR unless the user explicitly asks for one.

---

## CI / CD

- `.github/workflows/ci.yml` — lint, build, run migrations against a real
  Postgres, run vitest. Triggered on `main`, `develop`, and `claude/**`
  branches plus all PRs.
- `.github/workflows/deploy.yml` — builds the API image, pushes to ECR, runs
  a one-shot ECS migrate task, updates the ECS service, syncs the web build
  to S3, and invalidates CloudFront. Currently references placeholder values
  (account `123456789012`, several `secrets.*` not yet set) — do not assume
  it works end-to-end yet.
- `.github/workflows/security.yml` — `pnpm audit --audit-level=critical` and
  Trivy filesystem scan, weekly + on push/PR.

---

## Environment variables

Source of truth: `.env.example`. Copy to `.env` for local dev and fill in.
Never commit `.env`. Currently expected:

| Variable                   | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `NODE_ENV`, `PORT`, `CORS_ORIGINS` | Core API config                          |
| `DATABASE_URL`, `REDIS_URL`        | Datastores                              |
| `AWS_REGION`, `S3_INVOICES_BUCKET`, `S3_IMPORTS_BUCKET` | Object storage   |
| `SQS_QBO_SYNC_URL`, `SQS_EMAIL_URL` | Async work queues                       |
| `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `JWT_ISSUER`, `JWT_AUDIENCE` | Auth |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_WEBHOOK_SECRET` | QuickBooks |
| `SES_FROM`, `SES_FROM_ALLOWLIST`   | Outbound email                          |
| `TWILIO_*`                         | SMS                                     |
| `SENTRY_DSN`                       | Error tracking                          |
| `NEXT_PUBLIC_API_URL`              | Frontend → API base URL                 |

---

## Security

- Never commit secrets, credentials, or API keys.
- Validate every external input at the API boundary (DTOs + zod / class-validator).
- Tenant data is gated by Postgres RLS; treat any query that bypasses the
  shared `Db` provider as a bug.
- The dev login backdoor (`feat: dev-only login backdoor with HS256 JWT`) is
  gated by `NODE_ENV !== 'production'`. Verify that gate before any prod
  cutover.
- Audit dependencies before merging additions.

---

## Notes for AI assistants

- **Read first.** Always read files before editing. Do not assume contents.
- **Follow the branching convention.** AI-assistant work uses
  `claude/<session-id>`.
- **Keep changes minimal and focused.** Do not refactor adjacent code in the
  same change unless explicitly asked.
- **Do not hard-code credentials.**
- **Run `make lint` and `make test` after non-trivial changes.** CI will run
  them anyway, but failing fast locally is faster.
- **Do not create PRs unless explicitly asked.** Pushing to the working
  branch is enough.
- **Update this `CLAUDE.md`** when project structure, tooling, or
  conventions change in a way another agent would need to know.
- When uncertain about intent, read existing code, then ask rather than
  assume.

---

*Last updated: 2026-05-08 — Reflects state through `93dbea5` (Phase B: products
+ customers CRUD).*
