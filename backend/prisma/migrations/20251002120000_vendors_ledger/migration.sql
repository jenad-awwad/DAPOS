-- CreateEnum
CREATE TYPE "VendorLedgerSource" AS ENUM ('MANUAL', 'PROJECT');

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "startingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoices" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceNumberAuto" BOOLEAN NOT NULL DEFAULT false,
    "total" DECIMAL(12,2) NOT NULL,
    "attachmentKey" TEXT,
    "source" "VendorLedgerSource" NOT NULL DEFAULT 'MANUAL',
    "sourceOrderId" TEXT,
    "orderProjectMaterialId" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "remainingBalance" DECIMAL(12,2) NOT NULL,
    "attachmentKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_storeId_normalizedName_key" ON "vendors"("storeId", "normalizedName");

-- CreateIndex
CREATE INDEX "vendors_storeId_idx" ON "vendors"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_invoices_orderProjectMaterialId_key" ON "vendor_invoices"("orderProjectMaterialId");

-- CreateIndex
CREATE INDEX "vendor_invoices_storeId_invoiceDate_idx" ON "vendor_invoices"("storeId", "invoiceDate");

-- CreateIndex
CREATE INDEX "vendor_invoices_vendorId_idx" ON "vendor_invoices"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_invoices_sourceOrderId_idx" ON "vendor_invoices"("sourceOrderId");

-- CreateIndex
CREATE INDEX "vendor_payments_storeId_paidAt_idx" ON "vendor_payments"("storeId", "paidAt");

-- CreateIndex
CREATE INDEX "vendor_payments_vendorId_idx" ON "vendor_payments"("vendorId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
