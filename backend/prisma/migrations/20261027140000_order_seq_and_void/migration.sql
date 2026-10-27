ALTER TABLE "stores" ADD COLUMN "orderSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stores" ADD COLUMN "vendorInvoiceSeq" INTEGER NOT NULL DEFAULT 0;

UPDATE "stores" s
SET "orderSeq" = (SELECT COUNT(*) FROM "orders" o WHERE o."storeId" = s.id);

UPDATE "stores" s
SET "vendorInvoiceSeq" = (
  SELECT COUNT(*) FROM "vendor_invoices" v
  WHERE v."storeId" = s.id AND v."source" = 'MANUAL'
);

ALTER TABLE "orders" ADD COLUMN "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "voidedById" TEXT;

ALTER TABLE "orders"
ADD CONSTRAINT "orders_voidedById_fkey"
FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
