import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env files. Load the env file matching NODE_ENV
// (defaults to development) so CLI commands like `migrate`/`db push` get DATABASE_URL.
const nodeEnv = process.env.NODE_ENV ?? 'development';
try {
  process.loadEnvFile(path.resolve(__dirname, `.env.${nodeEnv}`));
} catch {
  // No env file for this NODE_ENV — rely on the ambient environment instead.
}

export default defineConfig({
  // Multi-file schema: Prisma merges every *.prisma file in this folder.
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    // `prisma db seed` runs the chart-of-accounts + admin bootstrap script.
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // Used only by the Prisma CLI (migrate/introspect). Prefer DIRECT_URL (the
    // non-pooled Neon endpoint) — DDL/advisory locks are unreliable through the
    // PgBouncer pooler — and fall back to DATABASE_URL when it isn't set. The
    // application runtime connects through the driver adapter in PrismaService.
    url: (process.env.DIRECT_URL ?? process.env.DATABASE_URL) as string,
  },
});
