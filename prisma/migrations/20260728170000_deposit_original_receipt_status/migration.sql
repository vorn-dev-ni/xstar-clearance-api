-- Add the new container-deposit status right after EIR_DOCS_COLLECTED.
ALTER TYPE "ContainerDepositStatus"
  ADD VALUE IF NOT EXISTS 'ORIGINAL_RECEIPT_COLLECTED' AFTER 'EIR_DOCS_COLLECTED';
