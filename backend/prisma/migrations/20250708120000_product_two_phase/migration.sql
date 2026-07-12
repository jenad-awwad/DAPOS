-- Two-phase product setup: optional SKU, required barcode/supplier/image, pricing flag

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "isPriced" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "products" ALTER COLUMN "sku" DROP NOT NULL;

UPDATE "products"
SET "isPriced" = true
WHERE "price" > 0 AND "cost" IS NOT NULL;

UPDATE "products"
SET "supplier" = 'Unknown'
WHERE "supplier" IS NULL;

UPDATE "products"
SET "imageUrl" = 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image'
WHERE "imageUrl" IS NULL;

UPDATE "products" AS p
SET "barcode" = generated.barcode
FROM (
  SELECT
    id,
    CONCAT(
      TO_CHAR(COALESCE("createdAt", NOW()), 'YYYYMMDD'),
      LPAD(
        ROW_NUMBER() OVER (
          PARTITION BY "storeId", DATE(COALESCE("createdAt", NOW()))
          ORDER BY "createdAt", id
        )::TEXT,
        4,
        '0'
      )
    ) AS barcode
  FROM "products"
  WHERE "barcode" IS NULL
) AS generated
WHERE p.id = generated.id;

ALTER TABLE "products" ALTER COLUMN "supplier" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "imageUrl" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "barcode" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "products_storeId_barcode_key" ON "products"("storeId", "barcode");
