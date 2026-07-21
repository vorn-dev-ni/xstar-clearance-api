import path from 'node:path';
import {
  DeleteObjectsCommand,
  S3Client,
  type ObjectIdentifier,
} from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

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

// ---------------------------------------------------------------------------
// Fresh-start production reset.
//
// Deletes all TRANSACTIONAL data (invoices, B/Ls, payments, expenses, income,
// journals, deposits, bonded stock, tax filings, reports, audit logs) while
// preserving MASTER + CONFIG data (users, roles/permissions, chart of accounts,
// customers, suppliers, company settings + logo, tax rates, payment terms).
//
// Record numbers reset automatically (they're computed from row counts), kept
// account balances are zeroed, and the S3 objects behind deleted uploads are
// removed. Guarded behind CONFIRM_RESET=DELETE; without it this is a dry run.
// ---------------------------------------------------------------------------

/** FileUpload.entityType values whose files belong to KEPT records. */
const KEEP_FILE_ENTITY_TYPES = ['Customer', 'User', 'CompanySettings'] as const;

/** Tables truncated wholesale (order irrelevant — one TRUNCATE ... CASCADE). */
const DELETE_TABLES = [
  'Invoice',
  'InvoiceLineItem',
  'Payment',
  'Deposit',
  'VendorPayment',
  'JournalEntry',
  'JournalEntryLine',
  'ExpenseRecord',
  'IncomeRecord',
  'ClearanceJob',
  'BillRecordItem',
  'BillExpenseItem',
  'BondedWarehouseItem',
  'BondedWarehouseMovement',
  'TaxFilingRecord',
  'FinancialReport',
  'AuditLog',
] as const;

/** Tables that must be preserved (reported for verification). */
const KEEP_TABLES = [
  'User',
  'RolePermission',
  'Account',
  'Customer',
  'Supplier',
  'CompanySettings',
  'TaxRate',
  'PaymentTerm',
] as const;

function dbHost(url: string | undefined): string {
  if (!url) return '(no DATABASE_URL)';
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function countTable(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "${table}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function report(label: string): Promise<void> {
  console.log(`\n=== ${label} ===`);
  const keepPairs = await Promise.all(
    KEEP_TABLES.map(async (t) => [t, await countTable(t)] as const),
  );
  const delPairs = await Promise.all(
    DELETE_TABLES.map(async (t) => [t, await countTable(t)] as const),
  );
  const fileTotal = await countTable('FileUpload');
  const fileKept = await prisma.fileUpload.count({
    where: { entityType: { in: [...KEEP_FILE_ENTITY_TYPES] } },
  });
  console.log('KEEP tables:');
  for (const [t, c] of keepPairs) console.log(`  ${t.padEnd(24)} ${c}`);
  console.log('DELETE tables:');
  for (const [t, c] of delPairs) console.log(`  ${t.padEnd(24)} ${c}`);
  console.log(
    `  ${'FileUpload'.padEnd(24)} ${fileTotal} (keep ${fileKept}, delete ${fileTotal - fileKept})`,
  );
}

/** Delete the S3 objects backing FileUpload rows that are about to be removed. */
async function deleteS3Objects(): Promise<void> {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    console.warn(
      '\n[S3] AWS credentials not set — skipping S3 object deletion (DB rows still removed).',
    );
    return;
  }

  const doomed = await prisma.fileUpload.findMany({
    where: {
      OR: [
        { entityType: null },
        { entityType: { notIn: [...KEEP_FILE_ENTITY_TYPES] } },
      ],
    },
    select: { bucket: true, key: true },
  });
  if (doomed.length === 0) {
    console.log('\n[S3] No file objects to delete.');
    return;
  }

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  // Group keys by bucket (each row carries its own bucket), delete ≤1000 at a time.
  const byBucket = new Map<string, ObjectIdentifier[]>();
  for (const f of doomed) {
    const list = byBucket.get(f.bucket) ?? [];
    list.push({ Key: f.key });
    byBucket.set(f.bucket, list);
  }

  let deleted = 0;
  for (const [bucket, objects] of byBucket) {
    for (let i = 0; i < objects.length; i += 1000) {
      const batch = objects.slice(i, i + 1000);
      const res = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch, Quiet: true },
        }),
      );
      deleted += batch.length - (res.Errors?.length ?? 0);
      if (res.Errors?.length) {
        console.warn(
          `[S3] ${res.Errors.length} object(s) failed to delete in ${bucket}:`,
          res.Errors.slice(0, 5),
        );
      }
    }
  }
  console.log(`\n[S3] Deleted ${deleted}/${doomed.length} object(s).`);
}

async function main(): Promise<void> {
  const confirmed = process.env.CONFIRM_RESET === 'DELETE';
  console.log('S.T STAR — production data reset');
  console.log(`  NODE_ENV : ${nodeEnv}`);
  console.log(`  DB host  : ${dbHost(process.env.DATABASE_URL)}`);
  console.log(`  Mode     : ${confirmed ? 'DELETE (live)' : 'DRY RUN'}`);

  await report('BEFORE');

  if (!confirmed) {
    console.log(
      '\nDry run only. Re-run with CONFIRM_RESET=DELETE to perform the wipe.',
    );
    return;
  }

  // 1) Remove S3 objects first (needs the FileUpload rows to still exist).
  await deleteS3Objects();

  // 2) Wipe the DB in a single transaction.
  //    TRUNCATE ... CASCADE resolves the circular FKs; kept tables are all
  //    parents of the truncated set so CASCADE never reaches them.
  const truncateList = DELETE_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      `DELETE FROM "FileUpload" WHERE "entityType" IS NULL OR "entityType" NOT IN ('Customer','User','CompanySettings')`,
    ),
    prisma.$executeRawUnsafe(`TRUNCATE ${truncateList} CASCADE`),
    prisma.$executeRawUnsafe(`UPDATE "Account" SET "balance" = 0`),
  ]);

  await report('AFTER');

  const remaining = await Promise.all(DELETE_TABLES.map((t) => countTable(t)));
  const leftover = remaining.reduce((a, b) => a + b, 0);
  if (leftover === 0) {
    console.log('\n✅ All transactional tables are empty. Reset complete.');
  } else {
    console.warn(
      `\n⚠️  ${leftover} row(s) still present across delete tables.`,
    );
  }
}

main()
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
