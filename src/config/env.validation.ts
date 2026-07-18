import { z } from 'zod';

/**
 * Environment contract for the API. `validate` runs at startup via ConfigModule,
 * so an invalid or missing variable fails fast before the server boots.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Non-pooled Neon endpoint (host without `-pooler`) used by the Prisma CLI for
  // migrations — DDL/advisory locks are unreliable through PgBouncer. Falls back
  // to DATABASE_URL when unset. Runtime pooling is unaffected.
  DIRECT_URL: z.string().optional(),

  // pg connection-pool tuning for the runtime driver adapter (PrismaPg). Safe
  // defaults; override per environment. See src/prisma/prisma.service.ts.
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(0),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30000),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10000),
  DB_POOL_MAX_USES: z.coerce.number().int().nonnegative().default(7500),
  // 0 = disabled (opt-in; the Neon pooler can reject unknown startup params).
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(0),
  // Comma-separated list of allowed origins, or `*` for any.
  CORS_ORIGIN: z.string().default('*'),
  // Secret used to sign/verify JWT access tokens.
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  // Access-token lifetime (any `ms`/jsonwebtoken duration string, e.g. `24h`).
  JWT_EXPIRY: z.string().default('24h'),

  // Rate limiting: window length (ms) and max requests per window per client IP.
  THROTTLE_TTL: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  // Set true when running behind a reverse proxy / load balancer so the
  // throttler sees the real client IP (X-Forwarded-For) instead of the proxy's.
  TRUST_PROXY: z.stringbool().default(false),

  // AWS S3 — backs the presigned-URL file upload service.
  AWS_REGION: z.string().min(1, 'AWS_REGION is required'),
  AWS_S3_BUCKET: z.string().min(1, 'AWS_S3_BUCKET is required'),
  AWS_ACCESS_KEY_ID: z.string().min(1, 'AWS_ACCESS_KEY_ID is required'),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, 'AWS_SECRET_ACCESS_KEY is required'),
  // Lifetime (seconds) of generated presigned upload/download URLs.
  S3_PRESIGN_EXPIRY: z.coerce.number().int().positive().default(900),
});

export type Env = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
