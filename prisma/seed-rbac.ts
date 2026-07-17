import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/permissions/permission.catalog';

// Load the env file matching NODE_ENV (runs outside Nest's ConfigModule).
const nodeEnv = process.env.NODE_ENV ?? 'development';
try {
  process.loadEnvFile(path.resolve(__dirname, `..`, `.env.${nodeEnv}`));
} catch {
  // Fall back to the ambient environment.
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL as string),
});

/**
 * Seed the default role → permission grants. Idempotent and safe for production
 * (no demo data): it only ensures each role's default permissions exist. It does
 * NOT delete extra grants an admin added via the UI. SUPER_ADMIN is a bypass and
 * is never stored.
 */
async function main(): Promise<void> {
  let count = 0;
  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role: role as UserRole, permission } },
        update: {},
        create: { role: role as UserRole, permission },
      });
      count++;
    }
  }
  console.log(`✅ Seeded ${count} default role permissions (${nodeEnv})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
