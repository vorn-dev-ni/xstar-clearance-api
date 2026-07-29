-- CreateTable: Clearance Plans (container rows linked to a Shipment / ClearanceJob).
CREATE TABLE "ClearancePlan" (
  "id" TEXT NOT NULL,
  "clearanceJobId" TEXT NOT NULL,
  "consignee" TEXT,
  "container" TEXT NOT NULL,
  "size" TEXT,
  "seal" TEXT,
  "commodity" TEXT,
  "port" TEXT,
  "clearanceDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClearancePlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClearancePlan_clearanceJobId_idx" ON "ClearancePlan"("clearanceJobId");
CREATE INDEX "ClearancePlan_clearanceDate_idx" ON "ClearancePlan"("clearanceDate");

ALTER TABLE "ClearancePlan"
  ADD CONSTRAINT "ClearancePlan_clearanceJobId_fkey"
  FOREIGN KEY ("clearanceJobId") REFERENCES "ClearanceJob"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
