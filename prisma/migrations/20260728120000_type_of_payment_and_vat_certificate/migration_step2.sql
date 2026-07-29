-- Run AFTER migration.sql commits (separate execution — new enum value can't be
-- used in the same transaction it was added in).
UPDATE "FileUpload" SET "documentType" = 'VAT_CERTIFICATE'
WHERE "documentType" = 'YEARLY_VAT_PAYMENT';
