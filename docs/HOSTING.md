# Hosting — three paths to a Mac/Windows desktop icon

> **Status:** Planned reference, not executed. Decision recorded
> 2026-05-08: hosting is **deferred**; we will pick a path once Phase C
> ships ([`PHASE_C_INVOICING.md`](PHASE_C_INVOICING.md)).
> **Goal of this doc:** when you're ready, you can pick one path and
> execute it from this file alone. No re-research.

---

## 0. What "icon on Finder/desktop" actually requires

The PWA is mechanically install-ready as of commit `db11855`:

- `apps/web/public/manifest.webmanifest` — name, icons, `display: standalone`, theme/background colors
- `apps/web/public/icons/{icon-192,icon-512,icon-maskable-512}.png` — present and brand-coloured
- `next.config.js` — service worker via `next-pwa` (disabled in dev, generated in prod build)
- `apps/web/src/lib/offline.ts` + `useOfflineSync.ts` — offline POS queue with auto-flush

The only missing piece is **a stable HTTPS origin** for the web app, with
the API reachable over HTTPS too. Once that's in place:

1. Open `https://<your-host>` in Chrome / Edge / Safari 16.4+.
2. Click the install icon (right end of the address bar; on Safari use
   the share menu → *Add to Home Screen / Add to Dock*).
3. The app lands in `~/Applications/` (macOS) or the Start Menu (Windows)
   and runs in its own window — no browser chrome.
4. POS still works while offline (idb-keyval queue + workbox `/v1/*` cache,
   commit `db11855`).

The icon launches whatever features are deployed at that moment. Today
that means: login, dashboard, products + customers CRUD, POS, sales
report, settings (users, warehouses). Phase C / D work expands the
surface but does not change the install mechanics.

---

## 1. Path A — proof-of-concept tunnel from your laptop

**Use when:** you want to feel the install flow today, demo to a
stakeholder, or test on a real iPhone / Android. Not for production.

**Time:** ~1 hour
**Cost:** $0 (free tiers)
**Lifespan:** only while your laptop is on; URL is volatile on free plans

### 1.1 Prereqs

- The local stack runs (`make setup && make install && make db && make api && make web`).
- A Cloudflare account (free) **or** an ngrok account (free).

### 1.2 Build a production bundle

```bash
# Build both apps in production mode so the service worker is generated
# (next-pwa is disabled in dev on purpose).
pnpm --filter @ns/api build
pnpm --filter @ns/web build

# Run them
NODE_ENV=production pnpm --filter @ns/api start &
NODE_ENV=production pnpm --filter @ns/web start &
```

### 1.3 Expose both ports over HTTPS

Two tunnels because the API and web are on different ports. Pick one
provider; do not mix.

**Option A.1 — Cloudflare Tunnel (recommended; free; named tunnels
survive restarts)**

```bash
brew install cloudflared             # macOS
cloudflared tunnel login              # opens browser, authorise once

cloudflared tunnel create ns-erp-dev
# Note the tunnel ID printed; put it in ~/.cloudflared/config.yml:
cat > ~/.cloudflared/config.yml <<'YAML'
tunnel: <tunnel-id-from-above>
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: erp-dev.<your-domain>
    service: http://localhost:3000
  - hostname: api-erp-dev.<your-domain>
    service: http://localhost:4000
  - service: http_status:404
YAML

cloudflared tunnel route dns ns-erp-dev erp-dev.<your-domain>
cloudflared tunnel route dns ns-erp-dev api-erp-dev.<your-domain>
cloudflared tunnel run ns-erp-dev
```

**Option A.2 — ngrok (faster setup; the free URL changes every restart)**

```bash
brew install ngrok
ngrok config add-authtoken <token-from-ngrok-dashboard>
ngrok http 3000 &                     # returns https://<rand>.ngrok-free.app for web
ngrok http 4000 &                     # returns a second URL for the API
```

Whichever you pick, set the web's API URL **before** the `next build`
above so the bundle bakes in the right host:

```bash
# In .env (local) or apps/web/.env.production.local
NEXT_PUBLIC_API_URL=https://api-erp-dev.<your-domain>/v1
```

### 1.4 Install on your machine

1. Open `https://erp-dev.<your-domain>` in Chrome / Edge.
2. Address bar → install icon (⊕) → "Install NaturalShea ERP".
3. macOS: the app appears in `~/Applications/Chrome Apps/` and Spotlight.
4. Windows: pinned to taskbar by default; "Pin to Start Menu" via right-click.

### 1.5 Gotchas

- **Hot reload won't help here.** PWA install needs the production bundle.
  Re-run `next build` and restart whenever you change frontend code.
- **CORS.** `apps/api/src/main.ts` reads `CORS_ORIGINS` from `.env`. Add
  the tunnel hostname before booting the API: `CORS_ORIGINS=https://erp-dev.<your-domain>`.
- **Cookie auth.** `apps/web/src/middleware.ts` checks an `ns_auth`
  cookie. Cloudflare passes it through, ngrok too — but if you proxy via
  some other tool, confirm the `Set-Cookie` header survives.

---

## 2. Path B — simpler stack: Vercel + Fly.io + Neon

**Use when:** you want a real icon installed by other people on real
machines, but don't want to operate AWS Multi-AZ RDS. This is the
**recommended first hosting target**.

**Time:** ~1–2 working days for the first deploy; ~5 minutes per redeploy
after that
**Cost:** ~$30–60/month at this workload (one tenant, one warehouse,
single-digit cashiers)

### 2.1 What goes where

| Layer        | Provider   | Why                                                                |
| ------------ | ---------- | ------------------------------------------------------------------ |
| Web (Next.js)| Vercel     | Native Next.js host; auto-HTTPS; CDN; preview deploys per PR.       |
| API (NestJS) | Fly.io     | Runs the existing `infra/docker/api.Dockerfile` as-is; persistent volumes for SQLite-style ops aren't needed since we use Neon for the DB. |
| Database     | Neon       | Serverless Postgres 15; branchable per environment; free tier ≈ 0.5 GB; $19/mo for 1 vCPU compute and 10 GB. |
| Cache / queue| Upstash Redis | Optional today (BullMQ planned; POS does not yet require it). $0 free tier. |
| Object store | S3 (real AWS) | Smaller-cost piece. ~$1/mo at this volume. Or Cloudflare R2 (free egress). |
| Email        | SES (real AWS) | Already coded against `@aws-sdk/client-ses`. Sandbox first, production access after a one-page request to AWS. |

You only touch AWS for SES + S3 (small, low risk). RDS / ECS / VPC stay
unprovisioned until Path C.

### 2.2 First-deploy runbook

**Step 1 — Database (Neon, ~10 min).**

1. Sign up at <https://neon.tech>; create project `naturalshea-erp` (region: AWS us-east-1 to keep API↔DB latency ≤30 ms).
2. Copy the connection string. It will look like
   `postgres://app:****@ep-cool-mountain-12345.us-east-1.aws.neon.tech/main?sslmode=require`.
3. From your laptop, set `DATABASE_URL=<that string>` and run:

   ```bash
   pnpm --filter @ns/api migrate
   docker compose -f infra/docker/docker-compose.yml exec -T postgres \
     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     < db/seeds/01_roles.sql                      # repeat for 02 + 03
   make admin-password EMAIL=lsarpong@naturalsheacare.com PASSWORD=<strong>
   ```

   Or run the SQL files directly with `psql`. Either way, RLS, the demo
   tenant, and a real admin password should be in place before continuing.

**Step 2 — API on Fly.io (~30 min).**

1. `brew install flyctl && flyctl auth login`.
2. From repo root: `flyctl launch --dockerfile infra/docker/api.Dockerfile --name ns-erp-api --region iad --no-deploy`.
   Edit the generated `fly.toml` so:

   ```toml
   [http_service]
   internal_port = 4000
   force_https = true
   auto_start_machines = true
   auto_stop_machines = true
   min_machines_running = 1
   ```

3. Set secrets (`flyctl secrets set ...`):

   ```
   NODE_ENV=production
   PORT=4000
   DATABASE_URL=<Neon URL from step 1>
   CORS_ORIGINS=https://erp.<your-domain>,https://<vercel-preview>.vercel.app
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=<IAM user with SES + S3 only>
   AWS_SECRET_ACCESS_KEY=<...>
   S3_INVOICES_BUCKET=ns-invoices-prod
   S3_IMPORTS_BUCKET=ns-imports-prod
   SES_FROM=lsarpong@naturalsheacare.com
   SES_FROM_ALLOWLIST=lsarpong@naturalsheacare.com,customer.service@naturalsheacare.com,maddo@naturalsheacare.com
   # DEV_JWT_SECRET intentionally NOT set — production must reject HS256 dev tokens.
   ```

   Optional today, required when BullMQ work starts:

   ```
   REDIS_URL=<Upstash rediss:// URL>
   SQS_QBO_SYNC_URL=
   SQS_EMAIL_URL=
   ```

4. `flyctl deploy`. First boot will pull the image, run `node dist/main.js`, register the health probe at `/v1/health`.
5. `curl https://ns-erp-api.fly.dev/v1/health` → expect `{ "status": "ok" }`.

**Step 3 — Web on Vercel (~15 min).**

1. <https://vercel.com> → import `Loodsarpong/MLOps`.
2. Root directory: `apps/web`. Framework preset: **Next.js**. Build command and install command auto-detect.
3. Environment variable:
   - `NEXT_PUBLIC_API_URL = https://ns-erp-api.fly.dev/v1` (or your custom domain once step 4 is done).
4. Deploy. Vercel returns `https://<project>-<branch>.vercel.app`.
5. Hit it in Chrome → install. Done.

**Step 4 — Custom domain + cleanup (~30 min).**

1. Buy or use `naturalsheacare.com`. Add two A/CNAME records:
   - `erp.naturalsheacare.com` → Vercel
   - `api.naturalsheacare.com` → Fly.io (`flyctl certs create api.naturalsheacare.com`)
2. Update `NEXT_PUBLIC_API_URL` in Vercel and `CORS_ORIGINS` in Fly. Redeploy both.
3. Update `apps/web/public/manifest.webmanifest` if you want a different `start_url` — currently `/dashboard`, which is correct for signed-in installs.
4. Re-install the PWA from the custom domain so the manifest origin matches future updates.

### 2.3 SES sandbox

Out of the box, AWS SES restricts From + To addresses to a verified
allowlist. Until production access is granted, `POST /invoices/:id/send`
(Phase C Day 2) will fail for any external customer email.

To request production access: AWS console → SES → Account dashboard →
*Request production access*. NaturalShea's use case (transactional
invoices to known customers) is a one-paragraph form. Approval usually
inside 24 hours.

### 2.4 Costs at NaturalShea's workload

| Item                    | Tier                        | Monthly |
| ----------------------- | --------------------------- | ------- |
| Vercel Hobby            | Free for non-commercial; Pro $20 if you need commercial use | $0–20 |
| Fly.io                  | shared-cpu-1x, 512 MB, always-on | ~$5  |
| Neon                    | Launch (1 vCPU, 10 GB)      | $19     |
| Upstash Redis           | Free tier (10k cmds/day)    | $0      |
| AWS SES                 | $0.10 / 1k emails           | <$1     |
| AWS S3                  | <1 GB                       | <$1     |
| Custom domain           | depends on registrar        | $1–2    |
| **Total**               |                             | **~$25–50** |

### 2.5 Migration to AWS later

Path B → Path C is a **deployment change, not a rewrite**:

- Database: `pg_dump` from Neon, restore to RDS, swap `DATABASE_URL`.
- API: same Docker image, push to ECR, update ECS task def.
- Web: change Vercel domain → CloudFront, repoint DNS.

Nothing in `apps/api` or `apps/web` is Vercel- or Fly-specific.

---

## 3. Path C — the planned AWS path

**Use when:** the business has outgrown Path B (multiple tenants, real
SLAs, regulatory pressure), or the AWS infrastructure is itself a
deliverable.

**Time:** ~5–7 working days for the first end-to-end deploy
**Cost:** ~$350/month at the baseline sizing in
[`DEPLOYMENT.md`](DEPLOYMENT.md) §6

### 3.1 What's already in the repo

- `infra/terraform/main.tf` — wires VPC, RDS, Redis, Cognito, S3, SQS,
  ECS API, web bucket, CloudFront. Structurally complete.
- `infra/terraform/modules/{network,rds,redis,ecs_service,s3_bucket,cognito,cloudfront}/` — module bodies, parameterised.
- `infra/terraform/envs/{dev,staging,prod}.tfvars` — per-environment inputs.
- `infra/docker/api.Dockerfile`, `infra/docker/web.Dockerfile` — the
  container images CI builds.
- `.github/workflows/deploy.yml` — ECR push + ECS update-service + S3 sync + CloudFront invalidation.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — the existing AWS guide. **Read it
  before starting.** This file complements it; it does not replace it.

### 3.2 Hard blockers between you and a first deploy

These were confirmed by grep on 2026-05-08. Each must be resolved before
the deploy workflow can succeed:

| Where                                                                | What                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `.github/workflows/deploy.yml:32`                                    | Placeholder AWS account ID `123456789012` in role-to-assume ARN     |
| `infra/terraform/envs/{dev,staging,prod}.tfvars:8`                   | Placeholder `123456789012` in `api_image` ECR URI                   |
| GitHub repo secrets                                                  | `PRIVATE_SUBNETS`, `TASK_SG`, `WEB_BUCKET`, `CDN_DISTRIBUTION_ID` not set |
| Terraform remote state                                               | `ns-tf-state` S3 bucket and `ns-tf-locks` DynamoDB table not provisioned (see DEPLOYMENT.md §1) |
| ECR                                                                  | Repository `ns-api` does not exist                                  |
| ACM + DNS                                                            | No certificate or A/AAAA record for `api.naturalshea.care`           |
| Cognito                                                              | `JWT_ISSUER` / `JWT_AUDIENCE` placeholders; the JWKS verification path in `apps/api/src/common/auth/jwt.guard.ts` has never been exercised against a real user pool. Per the locked decision (HANDOVER §7a.1) we are staying on local password auth, so this can be deferred — but `apps/api/src/main.ts` should still receive a Cognito-aware health probe before prod cutover. |
| SES                                                                  | Account is in the sandbox; a one-page form opens production access  |
| `DEV_JWT_SECRET`                                                     | Must be **unset** in the prod ECS task definition (see HANDOVER §7a.1) |

### 3.3 Suggested order of operations

1. **Day 1 — bootstrap.** Pick the AWS account, replace the four
   `123456789012` placeholders, create the remote-state bucket and lock
   table per `DEPLOYMENT.md` §1, create the ECR repository, set the
   GitHub secrets.
2. **Day 2 — staging Terraform apply.** Run from `infra/terraform/`:
   `terraform init -backend-config=...` then
   `terraform workspace new staging` and
   `terraform apply -var-file=envs/staging.tfvars`. Expect ~25 minutes
   for first apply; RDS is the long pole.
3. **Day 3 — first image push.** `docker buildx build --platform linux/amd64 -f infra/docker/api.Dockerfile -t <acct>.dkr.ecr.<region>.amazonaws.com/ns-api:staging . --push`. Then run the one-shot migration ECS task to apply migrations 0001 → 0010 against the new RDS.
4. **Day 4 — web deploy + DNS.** `pnpm --filter @ns/web build` → `aws s3 sync apps/web/.next/static s3://...`. Wire `api.naturalshea.care` and `app.naturalshea.care` (or whichever names you pick) at Route 53.
5. **Day 5 — smoke test + harden.** Curl `/v1/health`, hit the login page, smoke a POS sale, install the PWA from the prod URL. Confirm `DEV_JWT_SECRET` is not set in the task def. Request SES production access. Update `DEPLOYMENT.md` with anything you learned.
6. **Day 6–7 — prod.** Repeat 2–5 for the `prod` workspace. Cut over DNS.

### 3.4 Cost detail

See [`DEPLOYMENT.md`](DEPLOYMENT.md) §6 for the line-item breakdown
($350/month at baseline). NaturalShea's actual workload is well below
the assumptions in that table; expect to right-size RDS and ECS tasks
down once the staging apply has run for a week.

---

## 4. Recommendation

**Path B for the first hosted release; Path C as the eventual target,
not the first step.**

Rationale:
- Path B puts a real icon on cashier, accountant, and admin machines
  inside two days.
- The sticker shock of Path C is its operational surface area, not the
  $350/month — Multi-AZ RDS, ACM, ECS Fargate, CloudFront, and Cognito
  are all things that have to be operated, monitored, and rotated. None
  of them buy NaturalShea anything in week one of being live.
- Migrating from Path B to Path C is a deployment change, not a code
  rewrite, so the choice is genuinely reversible.

If the only thing you want today is to *see* the icon on your own dock
without hosting anything for anyone else: Path A and a Cloudflare
tunnel will do it in an hour.

---

*Author: handover pass, 2026-05-08. Update this file as a path is
chosen and executed.*
