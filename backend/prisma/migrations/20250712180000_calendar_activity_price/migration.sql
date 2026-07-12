-- Activity price and partial payments
ALTER TABLE "calendar_events" ADD COLUMN "price" DECIMAL(12,2);

CREATE TABLE "calendar_event_payments" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_event_payments_calendarEventId_paidAt_idx" ON "calendar_event_payments"("calendarEventId", "paidAt");

ALTER TABLE "calendar_event_payments" ADD CONSTRAINT "calendar_event_payments_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
