# AWS Deployment Guide

Terraform-managed infrastructure, split into `dev`, `staging`, `prod`
workspaces. Remote state: S3 bucket `ns-tf-state` + DynamoDB lock table
`ns-tf-locks`. Run from `infra/terraform/`.

## 1. One-time bootstrap

```bash
aws s3api create-bucket --bucket ns-tf-state --region us-east-1 \
  --create-bucket-configuration LocationConstraint=us-east-1
aws s3api put-bucket-versioning --bucket ns-tf-state \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket ns-tf-state \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws dynamodb create-table --table-name ns-tf-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## 2. Provision an environment

```bash
cd infra/terraform
terraform init -backend-config="bucket=ns-tf-state" \
               -backend-config="key=envs/prod/terraform.tfstate" \
               -backend-config="region=us-east-1" \
               -backend-config="dynamodb_table=ns-tf-locks"
terraform workspace new prod   # or: terraform workspace select prod
terraform apply -var-file=envs/prod.tfvars
```

Provisioned resources (abridged):

- VPC (3 AZs, public+private subnets, NAT, VPC endpoints for S3/ECR)
- RDS Postgres 15 Multi-AZ (`db.t4g.large`, 100 GB GP3, PITR 14 d)
- ElastiCache Redis 7 (cluster mode off, 1 primary + 1 replica)
- ECS Fargate cluster + services `ns-api`, `ns-worker`
- ALB + ACM cert for `api.naturalshea.care`
- S3 buckets: `ns-prod-invoices`, `ns-prod-imports`, `ns-prod-backups`
- CloudFront distribution → S3 origin for Next.js build, ALB origin for `/api/*`
- Cognito user pool `ns-prod`, app client, identity pool
- SQS queues: `ns-qbo-sync`, `ns-email-out`, `ns-sms-out` + DLQs
- Secrets Manager entries: `rds/master`, `qbo/<tenant>`, `twilio/primary`
- CloudWatch log groups + metric alarms + SNS topic `ns-ops-alerts`

## 3. CI/CD pipeline (GitHub Actions)

Workflow summary (`.github/workflows/ci.yml` and `deploy.yml`):

```
push / PR ─▶ CI
  ├─ setup pnpm + cache
  ├─ lint (eslint + prettier)
  ├─ type-check (tsc)
  ├─ test (vitest + supertest)
  └─ build (api + web)

push to main ─▶ Deploy
  ├─ build & push docker images to ECR (api + worker)
  ├─ `aws ecs update-service --force-new-deployment`
  ├─ run DB migrations in a one-shot task
  ├─ build web → `aws s3 sync` + `aws cloudfront create-invalidation`
  └─ smoke test `curl https://api.../health`
```

> **Apple Silicon gotcha.** If you ever build the API image on an M-series
> Mac and push it directly (skipping CI), use
> `docker buildx build --platform linux/amd64 ...`. Fargate runs amd64 by
> default and will refuse to start an arm64-only image. The GitHub Actions
> runner is already amd64, so the workflow above is unaffected.

> **Status check.** As of this writing the deploy workflow references a
> placeholder AWS account ID (`123456789012`) and several `secrets.*` that
> are not yet provisioned. Treat the pipeline as an outline that needs the
> first end-to-end run before it can be relied on.

OIDC is used for AWS auth (no long-lived keys in GitHub). Role:
`arn:aws:iam::<acct>:role/GitHubActionsDeploy`.

## 4. Environment variables (Parameter Store or task env)

```
NODE_ENV=production
DATABASE_URL=postgres://app:${DB_PASSWORD}@ns-prod.<id>.rds.amazonaws.com:5432/app
REDIS_URL=rediss://ns-prod.<id>.cache.amazonaws.com:6379
JWT_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/<pool>
JWT_AUDIENCE=<app_client_id>
S3_INVOICES_BUCKET=ns-prod-invoices
S3_IMPORTS_BUCKET=ns-prod-imports
SQS_QBO_SYNC_URL=https://sqs.us-east-1.amazonaws.com/.../ns-qbo-sync
SES_FROM=billing@naturalshea.care
TWILIO_ACCOUNT_SID_SECRET=arn:aws:secretsmanager:...:twilio/primary
QBO_CLIENT_ID=... (from Secrets Manager)
SENTRY_DSN=...
```

Secrets flow: Terraform writes ARNs; ECS task definitions use `secrets` block
to hydrate env vars from Secrets Manager at container start.

## 5. Operations runbook

| Scenario                   | Action                                                      |
| -------------------------- | ----------------------------------------------------------- |
| API 5xx spike              | CloudWatch alarm → PagerDuty; check Sentry + ECS events     |
| DB failover                | RDS promotes standby; app reconnects via RDS endpoint       |
| Blocked QBO token          | `/settings/integrations/quickbooks` shows; admin reconnects |
| Lost invoice PDF           | Regenerate: `POST /invoices/:id/regenerate-pdf` (admin)     |
| Restore point-in-time      | `aws rds restore-db-instance-to-point-in-time ...`          |
| Rollback deploy            | `aws ecs update-service --task-definition ns-api:PREVIOUS`  |

## 6. Cost profile (rough, monthly)

| Component         | Size               | ~USD |
| ----------------- | ------------------ | ---- |
| ECS Fargate (api) | 2 × 0.5 vCPU / 1 GB | 50  |
| ECS Fargate (worker) | 1 × 0.5 vCPU     | 25  |
| RDS Multi-AZ      | db.t4g.large       | 190  |
| ElastiCache       | cache.t4g.small    | 35   |
| ALB               | 1                  | 25   |
| CloudFront + S3   | 100 GB egress      | 15   |
| SES/SNS/SQS/KMS   | usage              | 10   |
| **Total**         |                    | ~350 |

Scale up `db.m6g.large` + 3 × api tasks around 20 concurrent outlets.
