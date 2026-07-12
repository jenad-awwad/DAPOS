-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('REGULAR', 'PROJECT');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('SCHEDULED_ORDER', 'INSTALLATION', 'DELIVERY', 'MEETING', 'ACTIVITY', 'OTHER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "orderType" "OrderType" NOT NULL DEFAULT 'REGULAR';
ALTER TABLE "orders" ADD COLUMN "projectTitle" TEXT;

-- CreateIndex
CREATE INDEX "orders_storeId_orderType_idx" ON "orders"("storeId", "orderType");

-- CreateTable
CREATE TABLE "order_project_materials" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "order_project_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CalendarEventType" NOT NULL DEFAULT 'OTHER',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "orderId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_project_materials_orderId_idx" ON "order_project_materials"("orderId");

-- CreateIndex
CREATE INDEX "calendar_events_storeId_startsAt_idx" ON "calendar_events"("storeId", "startsAt");

-- CreateIndex
CREATE INDEX "calendar_events_orderId_idx" ON "calendar_events"("orderId");

-- AddForeignKey
ALTER TABLE "order_project_materials" ADD CONSTRAINT "order_project_materials_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
