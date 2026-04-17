import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ISSUER: z.string().url(),
  JWT_AUDIENCE: z.string().min(1),
  COGNITO_REGION: z.string().default('us-east-1'),
  COGNITO_USER_POOL_ID: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  S3_INVOICES_BUCKET: z.string().default('ns-invoices'),
  S3_IMPORTS_BUCKET: z.string().default('ns-imports'),
  SQS_QBO_SYNC_URL: z.string().url().optional(),
  SQS_EMAIL_URL: z.string().url().optional(),
  SES_FROM: z.string().email().default('no-reply@naturalshea.care'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  QBO_CLIENT_ID: z.string().optional(),
  QBO_CLIENT_SECRET: z.string().optional(),
  QBO_REDIRECT_URI: z.string().url().optional(),
  SENTRY_DSN: z.string().optional(),
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
