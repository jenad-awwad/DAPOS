-- OrderStatus: add OPEN
ALTER TYPE "OrderStatus" ADD VALUE 'OPEN';

-- CalendarEventStatus
CREATE TYPE "CalendarEventStatus" AS ENUM ('OPEN', 'COMPLETED');

-- Project selling price fields (separate from material cost in subtotal)
ALTER TABLE "orders" ADD COLUMN "projectSellQuantity" DECIMAL(12,3);
ALTER TABLE "orders" ADD COLUMN "projectSellUnitPrice" DECIMAL(12,2);

-- Calendar event status + inline customer contact
ALTER TABLE "calendar_events" ADD COLUMN "status" "CalendarEventStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "calendar_events" ADD COLUMN "customerName" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN "customerPhone" TEXT;

CREATE INDEX "calendar_events_storeId_status_idx" ON "calendar_events"("storeId", "status");

-- Project adjustment audit log
CREATE TABLE "order_project_adjustments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_project_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_project_adjustments_orderId_createdAt_idx" ON "order_project_adjustments"("orderId", "createdAt");

ALTER TABLE "order_project_adjustments" ADD CONSTRAINT "order_project_adjustments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_project_adjustments" ADD CONSTRAINT "order_project_adjustments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
