-- CreateEnum
CREATE TYPE "FileUploadStatus" AS ENUM ('PENDING', 'UPLOADED');

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileUpload" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" "FileUploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_rate_key" ON "TaxRate"("rate");

-- CreateIndex
CREATE UNIQUE INDEX "FileUpload_key_key" ON "FileUpload"("key");

-- CreateIndex
CREATE INDEX "FileUpload_entityType_entityId_idx" ON "FileUpload"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "FileUpload_uploadedBy_idx" ON "FileUpload"("uploadedBy");
