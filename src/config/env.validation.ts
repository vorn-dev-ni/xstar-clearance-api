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
