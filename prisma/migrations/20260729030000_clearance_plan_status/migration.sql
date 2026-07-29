-- Clearance-plan lifecycle status (step-by-step workflow, mirrors ContainerDepositStatus).

-- CreateEnum
CREATE TYPE "ClearancePlanStatus" AS ENUM (
  'TRANSIT_DOCS_APPROVED',
  'CONTAINER_ARRIVED_DRY_PORT',
  'CUSTOMS_VALUATION_APPROVED',
  'CLEARANCE_IN_PROGRESS',
  'CLEARANCE_COMPLETED'
);

-- AlterTable: existing rows backfill to the first (default) step.
ALTER TABLE "ClearancePlan"
  ADD COLUMN "status" "ClearancePlanStatus" NOT NULL DEFAULT 'TRANSIT_DOCS_APPROVED';

-- CreateIndex
CREATE INDEX "ClearancePlan_status_idx" ON "ClearancePlan"("status");
