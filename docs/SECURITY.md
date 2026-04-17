# Security & RBAC

## 1. Authentication

- **Provider:** AWS Cognito user pool (one per environment).
- **Tokens:** OAuth 2.0 / OIDC; access token (JWT, 1 h) + refresh token (30 d).
- MFA (TOTP) required for `admin` and `accountant` roles.
- JWT custom claims:

  ```json
  { "sub":"c0a...", "custom:tenant_id":"9e5f...", "custom:roles":"admin,accountant" }
  ```

- NestJS `JwtAuthGuard` validates the token against Cognito JWKS
  (`https://cognito-idp.<region>.amazonaws.com/<pool>/.well-known/jwks.json`)
  with caching; then sets `req.user = { id, tenantId, roles }`.
- Database connections run `SET LOCAL app.tenant_id = '<uuid>'` so Postgres RLS
  policies enforce tenant isolation defense-in-depth.

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
