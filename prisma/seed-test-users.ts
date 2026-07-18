import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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
 * Shared demo password for the client-facing role test accounts. Identical in dev
 * and prod so the client can test either environment with one set of credentials.
 * NOTE: rotate/disable these before real go-live.
 */
const TEST_PASSWORD = 'Test@12345';

/**
 * One dedicated, client-friendly login per role — excluding SUPER_ADMIN, which
 * already exists (admin@stlogistics.com) and must not be touched.
 */
const TEST_USERS = [
  {
    email: 'accounting@ststar.com',
    firstName: 'Accounting',
    lastName: 'Tester',
    role: UserRole.ACCOUNTING,
    department: 'Finance & Accounting',
    phone: '012-000-002',
  },
  {
    email: 'operation@ststar.com',
    firstName: 'Operation',
    lastName: 'Tester',
    role: UserRole.OPERATION,
    department: 'Operations & Clearance',
    phone: '012-000-003',
  },
  {
    email: 'owner@ststar.com',
    firstName: 'Owner',
    lastName: 'Tester',
    role: UserRole.OWNER,
    department: 'Executive Management',
    phone: '012-000-004',
  },
];

/**
 * Seed the role test users. Idempotent and safe for production (users table only —
 * no chart of accounts, no demo business data). The password is written on both
 * create and update, so re-running always restores the known credentials.
 */
async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  for (const u of TEST_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        department: u.department,
        phone: u.phone,
        password: passwordHash,
      },
      create: {
        ...u,
        password: passwordHash,
      },
    });
  }

  console.log(`✅ Seeded ${TEST_USERS.length} role test users (${nodeEnv})`);
  console.log('   ─────────────────────────────────────────────');
  for (const u of TEST_USERS) {
    console.log(`   ${u.role.padEnd(11)}  ${u.email.padEnd(24)}  ${TEST_PASSWORD}`);
  }
  console.log('   ─────────────────────────────────────────────');
  console.log('   ⚠️  Shared demo logins — rotate/disable before go-live.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
