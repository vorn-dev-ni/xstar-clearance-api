-- AlterEnum: collapse the 5 legacy roles into 4. Existing users are remapped
-- (ADMIN→SUPER_ADMIN, ACCOUNTANT→ACCOUNTING, MANAGER/STAFF→OPERATION, VIEWER→OWNER).
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'ACCOUNTING', 'OWNER', 'OPERATION');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'SUPER_ADMIN'
    WHEN 'ACCOUNTANT' THEN 'ACCOUNTING'
    WHEN 'MANAGER' THEN 'OPERATION'
    WHEN 'STAFF' THEN 'OPERATION'
    WHEN 'VIEWER' THEN 'OWNER'
    ELSE 'OPERATION'
  END::"UserRole_new"
);
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OPERATION';
DROP TYPE "public"."UserRole_old";
COMMIT;

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_permission_key" ON "RolePermission"("role", "permission");
