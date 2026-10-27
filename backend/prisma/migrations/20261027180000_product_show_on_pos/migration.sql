ALTER TABLE "products" ADD COLUMN "showOnPos" BOOLEAN NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "storeId", COALESCE("categoryId", '')
      ORDER BY "name" ASC
    ) AS rn
  FROM "products"
  WHERE "isActive" = true AND "isPriced" = true
)
UPDATE "products" AS product
SET "showOnPos" = true
FROM ranked
WHERE product.id = ranked.id AND ranked.rn <= 12;
