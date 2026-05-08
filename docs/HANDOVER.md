# Handover — NaturalShea Care ERP

> **Audience.** The next engineer (or team) taking ownership of this codebase.
> **Goal.** Get you productive in under a day and unambiguous about what is
> built, what is half-built, and what has not been started.

---

## 0. Heads-up: the repo name lies

GitHub remote: **`Loodsarpong/MLOps`**. The code inside is **NaturalShea Care
ERP** — a multi-tenant TypeScript monorepo. The "MLOps" name is a historical
artifact from when the repo was first created from a template. Do not be
confused by it; nothing in this codebase is ML or MLOps related.

The npm package name (`naturalshea-erp` in `package.json`) and the README
reflect the real identity.

---

## 1. One-paragraph project summary

NaturalShea Care manufactures and distributes shea-based personal-care products
out of a US distribution centre (Brendamour, Blue Ash). This ERP runs the
business: product catalog, multi-warehouse inventory with FIFO batch tracking,
in-store POS (offline-capable PWA), customer/supplier management, sales
invoicing, procurement, and a future-state QuickBooks Online sync. It is built
as a NestJS REST API + Next.js 14 PWA on PostgreSQL with row-level security for
tenant isolation, deployed (target state) to AWS ECS Fargate with RDS, Redis,
S3, CloudFront, and Cognito.

---

## 2. Current state at a glance

### Shipped and working in local dev

| Area                       | Status         | Notes                                                         |
| -------------------------- | -------------- | ------------------------------------------------------------- |
| Auth (Phase A)             | Working        | Real password auth (argon2), JWT, admin user management, dev login backdoor |
| Tenant isolation (RLS)     | Working        | Postgres RLS via `set_config('app.tenant_id', ...)` per request |
| Products CRUD (Phase B)    | Working        | Admin UI at `/products`                                       |
| Customers CRUD (Phase B)   | Working        | Admin UI at `/customers`                                      |
| Warehouses                 | Working        | Single Brendamour DC seeded; admin settings page              |
| Inventory                  | Working        | Stock view, FIFO allocation in POS, multi-batch seed          |
| POS                        | Working        | Warehouse picker, product grid, offline queue, auto-flush on reconnect, email-clerk-on-sale |
| Sales reports              | Basic          | `/reports/sales` page exists                                  |
| Notifications              | Working        | SES email to warehouse clerk on POS sale; tax toggle          |
| Web app shell              | Working        | Toasts (sonner), skeletons, sign-out, active-nav, in-app 404, "soon" placeholders |
| PWA                        | Working        | `next-pwa` configured, offline POS supported via idb-keyval   |
| CI                         | Working        | Lint + build + migrate + test on every push and PR            |

### Modules present in API but not yet wired to UI

These have NestJS modules and (in some cases) controllers, but no end-user
screens — they are skeletons waiting on UI work:

- `suppliers/` (module only — no controller surfaced)
- `procurement/` (module only)
- `invoicing/` (controller exists, no UI)
- `payments/` (module only)
- `payroll/` (module only)
- `audit/` (cross-cutting; backing only)
- `integrations/quickbooks/` (controller + OAuth callback wired; sync logic and UI are TBD)
- `webhooks/` (controller exists; consumer-side TBD)

### Not started

- B2B wholesale portal (separate UX flow)
- Multi-currency (FX rates table, currency selector) — README still mentions
  GHS/EUR/GBP, but the tenant has been switched to US-only ops
- Batch & expiry UI (data model supports lots; no expiry-driven dashboard)
- Production AWS deploy: Terraform skeleton exists in `infra/terraform/`
  (modules: `network`, `rds`, `redis`, `ecs_service`, `s3_bucket`,
  `cloudfront`, `cognito`) with `dev/staging/prod.tfvars`, but it has **not
  been applied** end-to-end and the deploy workflow references a placeholder
  IAM role ARN (`123456789012`) and secrets that need provisioning
- Cognito JWT verification path (the dev backdoor issues HS256 JWTs locally;
  prod-style JWKS verification is not exercised against a real user pool)

---

## 3. Branch state

You are on `claude/handover-documentation-To9Pq`. Other branches in flight:

| Branch                                       | Purpose                                         |
| -------------------------------------------- | ----------------------------------------------- |
| `claude/handover-documentation-To9Pq`        | This handover work                              |
| `claude/claude-md-mmd3l92czdu9b5zz-bAzk1`    | Older CLAUDE.md edit branch                     |
| `claude/naturalshea-erp-system-RcvvA`        | The branch most product features were built on  |

`main` should be considered the integration target. Per the project's own
convention (see `CLAUDE.md`), feature branches use `feature/<slug>`, fixes use
`fix/<slug>`, and AI-assistant work uses `claude/<session-id>`.

### Recent commits worth knowing about

- `93dbea5` feat(crud): products + customers full CRUD with admin UIs (Phase B)
- `f0505e5` feat(auth): real password auth + admin user management (Phase A)
- `8abc42f` fix(rls): use `set_config()` instead of `SET LOCAL` for tenant_id — important: this is the mechanism every request relies on for tenant isolation
- `d10ad47` fix(db): drop FORCE on RLS so non-POS endpoints return rows again — see migration `0009_relax_force_rls.sql`
- `4817f57` feat(auth): dev-only login backdoor with HS256 JWT — local-dev only, must not be enabled in prod
- `20fe286` feat(locale,warehouse): switch tenant to US ops with single Brendamour DC

---

## 4. One-day onboarding

Time budget: ~3 hours to a working dev loop, the rest of the day to read code.

```bash
# 1. Prereqs (macOS)
brew install node@20 pnpm
brew install --cask docker        # then open Docker Desktop once

# 2. Clone + bootstrap
git clone git@github.com:Loodsarpong/MLOps.git naturalshea-erp
cd naturalshea-erp
make setup                        # writes .env from .env.example, starts Postgres/Redis/MinIO

# 3. Install + DB
make install                      # pnpm install --frozen-lockfile
make db                           # migrate + seed + set demo admin password

# 4. Run (two terminals)
make api                          # http://localhost:4000   (Nest, watch mode)
make web                          # http://localhost:3000   (Next.js)

# 5. Sign in
#   email:    lsarpong@naturalsheacare.com
#   password: dev-password
```

Run `make help` for the full target list. Useful ones:

- `make reset` — destructive: wipes the DB volume and re-seeds. Use freely in dev.
- `make admin-password EMAIL=x@y.z PASSWORD=secret` — set/reset any user's password
- `make logs` — tail docker compose logs
- `make test` / `make lint` — what CI runs

---

## 5. Where to look for what

| You want to…                       | Look at                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| Understand the system              | `docs/ARCHITECTURE.md`                                          |
| Understand the data model          | `docs/DATABASE_SCHEMA.md` + `db/migrations/*.sql` (10 of them)  |
| Understand the API surface         | `docs/API.md` + `apps/api/src/modules/*/`                       |
| Understand the frontend            | `docs/FRONTEND.md` + `apps/web/src/app/`                        |
| Understand QuickBooks plans        | `docs/QUICKBOOKS_INTEGRATION.md`                                |
| Bulk-load data                     | `docs/CSV_IMPORT.md` + `templates/csv/`                         |
| Deploy to AWS                      | `docs/DEPLOYMENT.md` + `infra/terraform/`                       |
| Run prod ops                       | `docs/RUNBOOK.md`                                               |
| Understand RBAC and tenancy        | `docs/SECURITY.md` + `apps/api/src/common/tenancy/`             |
| Find anything by file              | `docs/REPO_STRUCTURE.md`                                        |

> **Heads up.** Several of the `docs/*.md` files were drafted alongside the
> scaffold and have not all been re-validated since Phase A/B shipped. A
> follow-on audit pass is the next item on the handover backlog (see §8).

### Key code entry points

- `apps/api/src/main.ts` — Nest bootstrap, helmet, CORS, validation pipe
- `apps/api/src/app.module.ts` — every module wired up; the canonical
  inventory of what the backend does
- `apps/api/src/common/tenancy/` — how `tenant_id` is propagated to RLS
- `apps/api/src/common/auth/` — JWT guard + dev backdoor
- `apps/api/src/modules/pos/` — most business-critical module; FIFO
  allocation, idempotent sale endpoint, notification side-effect
- `apps/web/src/middleware.ts` — auth-cookie gate for the app group
- `apps/web/src/lib/offline.ts` + `useOfflineSync.ts` — POS offline queue

---

## 6. Known quirks and gotchas

1. **Two RLS migrations.** `0006_rls_policies.sql` enables RLS; `0009_relax_force_rls.sql`
   drops `FORCE` so that admin/non-POS reads work without setting a tenant. Do
   not re-add `FORCE` without revisiting the consumers.
2. **Tenant context is per-request.** `apps/api/src/common/tenancy/` calls
   `set_config('app.tenant_id', ...)` on the connection. If you introduce a
   new query path, make sure it runs through the same `Db` provider so RLS
   is set; otherwise RLS will silently filter to nothing.
3. **Dev login backdoor.** `feat(auth): dev-only login backdoor with HS256 JWT`
   is gated by `NODE_ENV !== 'production'`. Double-check that gate before any
   prod cutover.
4. **Seed flow.** `make seed` runs SQL through the Postgres container (`docker
   compose exec postgres psql`), not host `psql`. You do not need the
   Postgres client installed locally.
5. **`make reset` drops volumes.** Wipes Postgres, Redis, and MinIO data.
   This is intended for dev — do not point any of these scripts at a
   shared environment.
6. **Tax toggle.** POS tax is a per-sale flag, not a per-tenant default; if
   you add new sale entry points, decide explicitly whether they tax.
7. **PWA service worker.** `next-pwa` generates `sw.js` and `workbox-*.js` —
   they are gitignored. Hard-refresh after offline-feature changes; the SW
   caches aggressively.
8. **CI does not run integration tests.** Only unit tests (`vitest run
   --passWithNoTests`). The `test:e2e` target exists but has no real suite.
9. **Deploy workflow is not connected.** `.github/workflows/deploy.yml`
   references a placeholder AWS account ID (`123456789012`) and several
   `secrets.*` that are not yet set. The pipeline will fail on first run
   until infra is provisioned and the role/secrets are configured.

---

## 7. Open questions for the incoming owner

Decide these before pushing further:

1. **Single-tenant or multi-tenant in prod?** RLS infrastructure exists; the
   business currently runs one tenant (NaturalShea / Brendamour). Decide whether
   to keep multi-tenancy as a future option or simplify.
2. **QuickBooks integration scope.** The OAuth handshake is wired. Decide:
   (a) which entities sync (customers, invoices, payments, items?), (b) one-way
   or two-way, (c) push or pull (we currently have an SQS queue env var for it).
3. **Auth target.** Stay on dev backdoor + a local password table forever,
   move to Cognito, or use a third option (e.g., Auth0)? README and `.env.example`
   assume Cognito; nothing actually verifies a Cognito JWKS today.
4. **Phase C scope.** Phase A = auth, Phase B = catalog CRUD. The next
   natural Phase C is one of: suppliers + procurement, invoicing UI, or
   QuickBooks sync. Pick one and ship it before broadening.
5. **Multi-currency.** Drop entirely (US-only) or keep the schema and add UI
   when expanding into West Africa / EU?
6. **Batch & expiry surfacing.** The data model tracks lots; do clerks need
   an expiry-soon dashboard? Cosmetic regulation may force this question.

---

## 8. Suggested first-week plan

| Day | Focus                                                                        |
| --- | ---------------------------------------------------------------------------- |
| 1   | Run the stack locally; click through every screen; read `ARCHITECTURE.md`   |
| 2   | Read every migration top-to-bottom; sketch the ER diagram from memory       |
| 3   | Walk the API module-by-module from `app.module.ts`; trace one POS sale end-to-end |
| 4   | Audit `docs/*.md` against the code and fix drift (see §5 caveat)             |
| 5   | Pick a Phase C scope (§7.4) and write a one-page plan before coding          |

---

## 9. Conventions in force

These are real and enforced (or partially enforced) in this repo — not
aspirational:

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`, `ci:`, `refactor:`, `perf:`). Recent history is consistent.
- **Branches:** `feature/<slug>`, `fix/<slug>`, `claude/<session-id>`.
- **Lint:** `eslint` per package; `pnpm -r lint` runs both. CI gates this.
- **Tests:** `vitest`. CI runs `pnpm --filter @ns/api test` after migrations.
- **Types:** TypeScript strict-ish (loosened in some api tsconfigs — see
  `apps/api/tsconfig.json`). Tighten as you touch modules.
- **DB migrations:** `node-pg-migrate` (numbered SQL files in `db/migrations/`).
  Never edit a migration after it has been merged; add a new one.
- **Secrets:** Never in code. `.env` is gitignored; `.env.example` is the
  contract.

---

## 10. Contacts

| Resource                | Where                                       |
| ----------------------- | ------------------------------------------- |
| Code                    | `https://github.com/Loodsarpong/MLOps`      |
| Issue tracker           | GitHub Issues on the same repo              |
| CI                      | GitHub Actions (`.github/workflows/`)       |
| Demo admin              | `lsarpong@naturalsheacare.com`              |
| SES from-allowlist      | See `.env.example` `SES_FROM_ALLOWLIST`     |

---

*Last updated: 2026-05-08. Maintained on branch
`claude/handover-documentation-To9Pq`.*
