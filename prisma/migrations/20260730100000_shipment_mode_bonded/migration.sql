-- Add BONDED_WAREHOUSE to the ShipmentMode enum (import regime "Mode of shipment").
ALTER TYPE "ShipmentMode" ADD VALUE IF NOT EXISTS 'BONDED_WAREHOUSE' BEFORE 'OTHER';
