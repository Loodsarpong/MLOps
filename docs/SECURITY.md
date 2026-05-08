# Security & RBAC

## 1. Authentication

The system supports three auth modes; the JWT guard at
`apps/api/src/common/auth/jwt.guard.ts` decides which based on `NODE_ENV`
and the token format.

### 1.1 Local password auth (Phase A — current default)

- Passwords stored as **argon2id** hashes in `users.password_hash` (added by
  migration `0010_user_passwords.sql`).
- **Lockout:** 5 failed attempts → 15-minute lockout, tracked via
  `failed_login_count` and `locked_until` on the users table.
- **Forced rotation:** `must_change_password = TRUE` (set by admins when
  issuing or resetting a password) routes the user to `/change-password`
  before the dashboard.
- Issued JWT is signed locally; the web app stores it in a `ns_auth`
  cookie that the Next.js `middleware.ts` checks before allowing access to
  the `(app)` route group.

### 1.2 Cognito JWT (target state)

- **Provider:** AWS Cognito user pool (one per environment).
- **Tokens:** OAuth 2.0 / OIDC; access token (JWT, 1 h) + refresh token (30 d).
- MFA (TOTP) required for `admin` and `accountant` roles.
- JWT custom claims:

  ```json
  { "sub":"c0a...", "custom:tenant_id":"9e5f...", "custom:roles":"admin,accountant" }
  ```

- The guard would validate the token against Cognito JWKS
  (`https://cognito-idp.<region>.amazonaws.com/<pool>/.well-known/jwks.json`)
  with caching, then set `req.user = { id, tenantId, roles }`. The plumbing
  exists (`jwks-rsa` is a dependency) but has not been exercised against a
  real user pool yet.

### 1.3 Dev backdoor

- When `NODE_ENV !== 'production'`, the guard accepts HS256-signed JWTs
  using `DEV_JWT_SECRET`.
- Used by the local `make admin-password` flow, e2e tooling, and the seed
  data so that contributors can hit the API without a Cognito pool.
- **Guard before any prod cutover:** verify that `NODE_ENV` is `production`
  and that `DEV_JWT_SECRET` is unset (or rotated) in deployed environments.

### 1.4 Tenant isolation (defense-in-depth)

- The API runs `SELECT set_config('app.tenant_id', '<uuid>', true)` per
  request so Postgres RLS filters every tenant-scoped query.
- See `apps/api/src/common/tenancy/`. Any query path that bypasses the
  shared `Db` provider misses this — treat that as a bug.
- Migration `0009_relax_force_rls.sql` removed `FORCE` from RLS so admin /
  non-tenant-scoped paths work without setting a tenant. Do not re-add
  `FORCE` without revisiting the consumers.

## 2. Authorization (RBAC)

Role matrix (baseline — permissions live in `roles.permissions` JSONB):

| Permission                 | admin | accountant | sales_rep | inventory_manager | cashier | viewer |
| -------------------------- | :---: | :--------: | :-------: | :---------------: | :-----: | :----: |
| tenants:update             |  ✓    |            |           |                   |         |        |
| users:manage               |  ✓    |            |           |                   |         |        |
| customers:read             |  ✓    |   ✓        |   ✓       |                   |    ✓    |   ✓    |
| customers:write            |  ✓    |            |   ✓       |                   |         |        |
| products:read              |  ✓    |   ✓        |   ✓       |   ✓               |    ✓    |   ✓    |
| products:write             |  ✓    |            |           |   ✓               |         |        |
| inventory:read             |  ✓    |   ✓        |   ✓       |   ✓               |    ✓    |   ✓    |
| inventory:write            |  ✓    |            |           |   ✓               |         |        |
| sales:create               |  ✓    |            |   ✓       |                   |    ✓    |        |
| pos:checkout               |  ✓    |            |           |                   |    ✓    |        |
| invoices:issue             |  ✓    |   ✓        |   ✓       |                   |         |        |
| invoices:void              |  ✓    |   ✓        |           |                   |         |        |
| payments:record            |  ✓    |   ✓        |           |                   |    ✓    |        |
| procurement:create         |  ✓    |            |           |   ✓               |         |        |
| procurement:approve        |  ✓    |   ✓        |           |                   |         |        |
| payroll:run                |  ✓    |   ✓        |           |                   |         |        |
| reports:read               |  ✓    |   ✓        |   ✓       |   ✓               |         |   ✓    |
| integrations:quickbooks    |  ✓    |   ✓        |           |                   |         |        |
| audit:read                 |  ✓    |   ✓        |           |                   |         |        |

Enforcement points:
- Route level: `@Roles('admin','accountant')` decorator + `RolesGuard`.
- Object level: repositories always filter by `tenant_id`; RLS blocks leaks.
- UI level: `<Can permission="invoices:void">…</Can>` hides actions.

## 3. Data protection

- **In transit:** TLS 1.2+ (ACM cert); HSTS preload; CloudFront policy.
- **At rest:** RDS storage encrypted (KMS `alias/ns-rds`), S3 SSE-KMS,
  ElastiCache at-rest + in-transit encryption.
- **Secrets:** AWS Secrets Manager; no secrets in env files or code.
- **PII:** customer email/phone treated as confidential; redacted in logs.
- **Backups:** RDS PITR 14 d, nightly snapshots retained 30 d, quarterly to
  Glacier for 7 years (tax retention).

## 4. Audit logging

- Every financial mutation writes an `audit_logs` row with actor, before/after.
- Append-only: no `UPDATE`/`DELETE` on `audit_logs` (enforced by role).
- Daily export to `s3://ns-prod-audit/YYYY/MM/DD.jsonl.gz` with Object Lock
  (compliance mode, 7 years).
- Surface in UI at `/settings/audit?entity=invoice&id=...`.

## 5. Application hardening

- Input validation with `zod` on every DTO boundary.
- SQL via parameterized queries only (Kysely/Prisma); no string concat.
- Rate limiting via Redis (`express-rate-limit`); burst + sliding window.
- CSRF: SameSite=Lax cookies + Origin header check on mutating requests when
  cookie auth is used; bearer JWT routes are CSRF-safe.
- Security headers via `helmet`: CSP (strict, nonce-based), X-Frame-Options DENY,
  Referrer-Policy: no-referrer, Permissions-Policy.
- Dependency scanning: `npm audit` + Snyk in CI; Renovate bot for updates.
- Container scan: `trivy` on every image.
- SAST: `semgrep` ruleset "owasp-top-ten" in CI.

## 6. Incident response

1. Triage from Sentry/CloudWatch alert → Severity S1–S3.
2. Freeze deploys on S1; create incident channel.
3. Mitigate (rollback, circuit-breaker, key rotation).
4. Post-mortem within 5 business days, filed under `docs/incidents/`.

## 7. Compliance considerations

- **GDPR / Ghana DPA:** customer data export + deletion endpoints.
- **PCI DSS:** NaturalShea does **not** store card PANs; payments are
  delegated to PSPs (Stripe/Paystack/Flutterwave) via hosted fields.
- **Cosmetic regulations:** batch/lot numbers and expiry retained 5 years
  post-sale; stored on `batches` and `invoice_lines`.
