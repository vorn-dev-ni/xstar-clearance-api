-- Enforce one clearance plan per container within a shipment. Backstops the
-- app-level dedupe in syncJobContainers. Safe: verified no existing duplicate
-- (clearanceJobId, container) groups before creating the index.
CREATE UNIQUE INDEX IF NOT EXISTS "ClearancePlan_clearanceJobId_container_key"
  ON "ClearancePlan" ("clearanceJobId", "container");
