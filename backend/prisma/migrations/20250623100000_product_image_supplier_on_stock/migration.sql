-- Add product image and supplier; rename stockQty to onStock
ALTER TABLE "products" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "products" ADD COLUMN "supplier" TEXT;
ALTER TABLE "products" RENAME COLUMN "stockQty" TO "onStock";

CREATE INDEX "products_storeId_supplier_idx" ON "products"("storeId", "supplier");
