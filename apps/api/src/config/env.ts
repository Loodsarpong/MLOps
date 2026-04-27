import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalStr = z.preprocess(emptyToUndefined, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  DEV_JWT_SECRET: z.string().default('dev-only-secret-change-me'),
  COGNITO_REGION: z.string().default('us-east-1'),
  COGNITO_USER_POOL_ID: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  S3_INVOICES_BUCKET: z.string().default('ns-invoices'),
  S3_IMPORTS_BUCKET: z.string().default('ns-imports'),
  SQS_QBO_SYNC_URL: optionalUrl,
  SQS_EMAIL_URL: optionalUrl,
  SES_FROM: z.string().email().default('lsarpong@naturalsheacare.com'),
  SES_FROM_ALLOWLIST: z.string().default('lsarpong@naturalsheacare.com,customer.service@naturalsheacare.com,maddo@naturalsheacare.com'),
  TWILIO_ACCOUNT_SID: optionalStr,
  TWILIO_AUTH_TOKEN: optionalStr,
  TWILIO_FROM: optionalStr,
  QBO_CLIENT_ID: optionalStr,
  QBO_CLIENT_SECRET: optionalStr,
  QBO_REDIRECT_URI: optionalUrl,
  SENTRY_DSN: optionalStr,
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;
export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten());
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
