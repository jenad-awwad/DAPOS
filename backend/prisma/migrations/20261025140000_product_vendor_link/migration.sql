ALTER TABLE "products" ADD COLUMN "vendorId" TEXT;

CREATE INDEX "products_storeId_vendorId_idx" ON "products"("storeId", "vendorId");

ALTER TABLE "products" ADD CONSTRAINT "products_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "products" AS p
SET "vendorId" = v."id"
FROM "vendors" AS v
WHERE v."storeId" = p."storeId"
  AND v."normalizedName" = lower(regexp_replace(trim(p."supplier"), '\s+', ' ', 'g'))
  AND p."vendorId" IS NULL;
