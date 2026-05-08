# NaturalShea Care ERP — Deployment Runbook

One-stop reference for bringing up the full stack on **macOS** or **Windows**,
testing the **PWA**, and shipping to AWS. Every command is copy-paste ready.

---

## 0. Stack at a glance

| Layer | Tech | Port (local) |
|-------|------|-------------|
| Web / PWA | Next.js 14 (App Router, `next-pwa`) | `3000` |
| API | NestJS 10 + Kysely + pg | `4000` |
| DB | Postgres 15 (Docker) | `5432` |
| Cache / Queue | Redis 7 (Docker) | `6379` |
| Object store | MinIO (S3-compatible, Docker) | `9000` / `9001` |
| Worker | Nest standalone (SQS poller) | — |
| Cloud (prod) | ECS Fargate, RDS, ElastiCache, S3, CloudFront, Cognito, SQS | — |

Repo: `Loodsarpong/MLOps` (the GitHub name is historical — the project
inside is the NaturalShea Care ERP, see [`HANDOVER.md`](HANDOVER.md)).
Active integration branch: `main`. Most product features were built on
`claude/naturalshea-erp-system-RcvvA`; ongoing handover work lives on
`claude/handover-documentation-To9Pq`.

---

## 1. Prerequisites

### macOS (Apple Silicon or Intel)

```bash
# Homebrew (if missing)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Toolchain
brew install nvm pnpm git libpq awscli terraform colima docker docker-compose

# Node 20 LTS (repo requires 20, not 22/23/24/25)
mkdir -p ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20
nvm alias default 20

# psql on PATH
brew link --force libpq

# Corepack for pnpm pinning
corepack enable
```

### Windows 10/11

Use **WSL2 + Ubuntu** (matches the Linux containers the app deploys to).

```powershell
# PowerShell (Admin) — one time
wsl --install -d Ubuntu-22.04
# reboot when prompted, then open Ubuntu from Start menu and set a Linux user
```

Inside the Ubuntu shell:

```bash
sudo apt update && sudo apt install -y curl git build-essential postgresql-client unzip

# Node 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 20 && nvm alias default 20

# pnpm
corepack enable

# Docker Desktop for Windows → enable "WSL 2 integration" for your Ubuntu distro
# (Settings → Resources → WSL Integration)

# Terraform & AWS CLI
sudo snap install terraform --classic
sudo snap install aws-cli --classic
```

### Verify

```bash
node -v        # v20.x
pnpm -v        # 9.x
psql --version # psql 15+
docker ps      # empty table, not an error
terraform -v   # 1.6+
aws --version  # 2.x
```

---

## 2. Clone & install

```bash
git clone https://github.com/Loodsarpong/MLOps.git naturalshea-erp
cd naturalshea-erp
git checkout claude/naturalshea-erp-system-RcvvA

cp .env.example .env
pnpm install
```

`.env` ships with sane local defaults. No edits required for first boot.

---

## 3. Start local infrastructure (Docker)

### macOS with Colima

```bash
colima start --cpu 4 --memory 6
docker context use colima
# persist socket for compose
echo 'export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"' >> ~/.zshrc
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
```

### macOS with Docker Desktop, or Windows (WSL2)

Just launch Docker Desktop. Nothing else to configure.

### Bring up Postgres + Redis + MinIO

```bash
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml ps
```

All three should show `running` / `healthy` after ~20 s.

| Service | URL / creds |
|---------|-------------|
| Postgres | `postgres://app:app@localhost:5432/app` |
| Redis | `redis://localhost:6379` |
| MinIO API | `http://localhost:9000` |
| MinIO console | `http://localhost:9001` (user `minio` / pass `minio12345`) |

---

## 4. Apply migrations + seeds

The simplest path is `make db`, which runs the migrations through
`node-pg-migrate` and then pipes the seed SQL files through the Postgres
container (so you do not need a host `psql`):

```bash
make db        # = make migrate + make seed + bootstrap demo admin password
```

If you prefer to run the SQL directly with host `psql`, the current
migration set is **0001 → 0010**:

```bash
export DATABASE_URL=postgres://app:app@localhost:5432/app

psql "$DATABASE_URL" -f db/migrations/0001_init.sql
psql "$DATABASE_URL" -f db/migrations/0002_products_inventory.sql
psql "$DATABASE_URL" -f db/migrations/0003_sales_invoicing.sql
psql "$DATABASE_URL" -f db/migrations/0004_procurement_ap.sql
psql "$DATABASE_URL" -f db/migrations/0005_payroll_audit.sql
psql "$DATABASE_URL" -f db/migrations/0006_rls_policies.sql
psql "$DATABASE_URL" -f db/migrations/0007_locale_us.sql           # GHS → USD, Africa/Accra → America/New_York
psql "$DATABASE_URL" -f db/migrations/0008_warehouse_clerk_and_tax.sql  # warehouse clerk + tenant tax + per-sale tax flag + notification_log
psql "$DATABASE_URL" -f db/migrations/0009_relax_force_rls.sql     # drop FORCE so admin reads work
psql "$DATABASE_URL" -f db/migrations/0010_user_passwords.sql      # argon2 password fields + lockout

psql "$DATABASE_URL" -f db/seeds/01_roles.sql
psql "$DATABASE_URL" -f db/seeds/02_demo_tenant.sql
psql "$DATABASE_URL" -f db/seeds/03_demo_inventory.sql
```

A clean run prints `CREATE TABLE` / `INSERT 0 N` lines. With the current
seeds, expect roughly: `INSERT 0 6` roles, **`INSERT 0 1` warehouse**
(Brendamour Blue Ash DC, code `WH-BLUEASH` — the tenant is now US-only),
plus the products / customers / inventory rows from `02_demo_tenant.sql` and
`03_demo_inventory.sql`. Currency in seeded data is `USD`.

### Re-seeding from scratch

```bash
make reset      # docker compose down -v && up -d && migrate + seed
```

---

## 5. Run the app

**Terminal 1 — API**

```bash
pnpm --filter @ns/api dev
```

Wait for `API listening on :4000` and the route map (~20 routes).

**Terminal 2 — Web**

```bash
pnpm --filter @ns/web dev
```

Wait for `Ready in Xs`.

**Terminal 3 (optional) — Worker (SQS poller)**

```bash
pnpm --filter @ns/api worker
```

Safe to skip locally; the API still boots without it.

---

## 6. Smoke test

```bash
# Health (DB connectivity)
curl -s http://localhost:4000/v1/health
# {"status":"ok","info":{"database":{"status":"up"}},...}

# Swagger UI
open http://localhost:4000/docs            # macOS
explorer.exe http://localhost:4000/docs    # Windows

# Web
open http://localhost:3000
open http://localhost:3000/login
```

---

## 7. PWA (Progressive Web App)

The web app is PWA-enabled via `next-pwa`. Caching strategies (from
`apps/web/next.config.js`):

- `CacheFirst` for `/_next/static/*` (30-day expiration)
- `NetworkFirst` for `/api/*` GET (4 s network timeout)

Manifest lives at `apps/web/public/manifest.webmanifest`.

### PWA is disabled in dev on purpose

`disable: process.env.NODE_ENV === 'development'` — service workers make
hot-reload painful. To test PWA behaviour you must build a production bundle.

### Build & serve production bundle locally

```bash
pnpm --filter @ns/web build
pnpm --filter @ns/web start
```

Then in the browser DevTools:

1. `Application → Manifest` — confirm name, icons, theme color.
2. `Application → Service Workers` — confirm `sw.js` registered and active.
3. `Application → Cache Storage` — should see `next-static` and `api-get`.
4. Address bar → install icon (⊕) → "Install NaturalShea ERP".

### Install on iOS / iPad

Safari → share button → **Add to Home Screen**. iOS does not support full
service workers for installed PWAs but cached routes work.

### Install on Android

Chrome → three-dot menu → **Install app**. Full service worker + offline
support.

### Install on desktop

Chrome / Edge → address bar install icon. Runs in its own window, shows in OS
launcher.

### Offline POS test (the key PWA feature)

1. Load `/pos` while online.
2. Open DevTools → Network tab → set to **Offline**.
3. Add items to cart and submit a sale. Expected: sale is queued to IndexedDB
   (keyed on `nanoid` idempotency key) and UI shows "queued offline".
4. Flip back to Online. The queue drains to `POST /v1/pos/sync` and the sale
   posts.

Inspect the queue via DevTools → `Application → IndexedDB → keyval-store`.

---

## 8. Common troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `pnpm -v` → `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` | Corepack shim expects `packageManager` key | `corepack enable && corepack prepare pnpm@9 --activate` |
| `pnpm install --frozen-lockfile` fails on first run | No lockfile yet | Run `pnpm install` (without `--frozen-lockfile`) |
| TS `Option 'bundler' can only be used when 'module' is set to 'preserve' or 'es2015'+` | `moduleResolution: bundler` vs `module: commonjs` | `moduleResolution: node` set in `apps/api/tsconfig.json` |
| `Cannot find module 'express'` / `'jsonwebtoken'` | Missing `@types/*` | `pnpm install --no-frozen-lockfile` (package.json now pins them) |
| `Invalid environment: REDIS_URL Required` despite `.env` | `dotenv` CWD = `apps/api`, not repo root | Fixed in `main.ts` — loads `../../../.env` explicitly |
| `Invalid url` on `SQS_QBO_SYNC_URL` | Empty string ≠ undefined for `z.string().url().optional()` | `preprocess` coerces empty → undefined in `env.ts` |
| `Package "@nestjs/axios" is missing` | Optional peer of Terminus' HttpHealthIndicator | Dropped unused `HttpHealthIndicator` |
| `class-validator is missing` | ValidationPipe optional peer | Added to deps |
| Module not found `@/lib/auth` in web | Inherited `baseUrl: "."` from repo-root tsconfig pointed to repo root | Added `"baseUrl": "."` inside `apps/web/tsconfig.json` |
| `failed to connect to docker API at /var/run/docker.sock` with Colima | Colima uses `~/.colima/default/docker.sock` | `docker context use colima` + export `DOCKER_HOST` |
| zsh `quote>` prompt stuck | Unclosed quote from paste | `Ctrl+C` and re-run without `#` comments on same line |
| zsh `no matches found: (...)` | zsh glob expansion on `(Ctrl+C)` etc. in comments | Ignore; zsh tried to glob literal text |
| `themeColor is configured in metadata` warning | Next 14 moved it to `viewport` export | Harmless; TODO to migrate |
| Docker image works locally on Mac, fails on Fargate | ARM64 → AMD64 mismatch | `docker buildx build --platform linux/amd64 --push ...` |

---

## 9. Daily dev loop

```bash
# Each day
docker compose -f infra/docker/docker-compose.yml up -d     # if stopped
pnpm --filter @ns/api dev                                   # terminal 1
pnpm --filter @ns/web dev                                   # terminal 2

# Before commit
pnpm -r lint
pnpm -r build
pnpm -r test

# Commit
git add -A
git commit -m "feat(scope): short description"
git push origin <your-feature-or-claude-branch>
```

---

## 10. Cloud deployment preview

Fully scripted via Terraform + GitHub Actions. High-level flow below; full
commands in `docs/DEPLOYMENT.md`.

```
GitHub push (main)
      │
      ├── CI (.github/workflows/ci.yml)
      │     lint · build · test · migrate · test
      │
      └── Deploy (.github/workflows/deploy.yml)
            ├── build & push Docker to ECR (arm64 + amd64)
            ├── run one-shot migration task
            ├── ECS update-service --force-new-deployment
            ├── aws s3 sync web/.next/static  +  CloudFront invalidation
            └── smoke curl https://api.../v1/health
```

Environments: `dev` → `staging` → `prod`, each a Terraform workspace. Rough
monthly cost per env: ~$350 at the baseline sizing in `docs/DEPLOYMENT.md`.

---

## 11. Handy one-liners

```bash
# Tail Postgres queries
docker exec -it docker-postgres-1 psql -U app -d app \
  -c "SELECT pid, query, state FROM pg_stat_activity WHERE state='active';"

# Regenerate demo data
psql "$DATABASE_URL" -c "TRUNCATE tenants CASCADE;"
psql "$DATABASE_URL" -f db/seeds/02_demo_tenant.sql

# Provision another tenant
pnpm ts-node scripts/create-tenant.ts \
  --name "Demo Co" --slug demo --admin-email ops@demo.test

# Clear Next cache after deps upgrade
rm -rf apps/web/.next

# Reset Docker state completely
docker compose -f infra/docker/docker-compose.yml down -v
```

---

*Last updated: 2026-04-17. Keep this file in sync with `docs/DEPLOYMENT.md`.*
