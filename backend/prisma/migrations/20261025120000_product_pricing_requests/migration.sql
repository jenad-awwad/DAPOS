CREATE TYPE "PricingRequestStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "product_pricing_requests" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "PricingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "completedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pricing_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_pricing_requests_storeId_status_idx" ON "product_pricing_requests"("storeId", "status");
CREATE INDEX "product_pricing_requests_productId_idx" ON "product_pricing_requests"("productId");

ALTER TABLE "product_pricing_requests" ADD CONSTRAINT "product_pricing_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_pricing_requests" ADD CONSTRAINT "product_pricing_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_pricing_requests" ADD CONSTRAINT "product_pricing_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_pricing_requests" ADD CONSTRAINT "product_pricing_requests_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_pricing_requests" ADD CONSTRAINT "product_pricing_requests_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "product_pricing_requests" (
    "id",
    "storeId",
    "productId",
    "status",
    "requestedById",
    "submittedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'pricing-' || p."id",
    p."storeId",
    p."id",
    'PENDING',
    admin."id",
    p."createdAt",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "products" p
JOIN LATERAL (
    SELECT u."id"
    FROM "users" u
    WHERE u."storeId" = p."storeId" AND u."isActive" = true
    ORDER BY CASE WHEN u."role" = 'ADMIN' THEN 0 ELSE 1 END, u."createdAt" ASC
    LIMIT 1
) admin ON true
WHERE p."isPriced" = false;
