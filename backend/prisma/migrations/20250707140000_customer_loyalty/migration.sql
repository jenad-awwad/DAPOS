ALTER TABLE "customers" ADD COLUMN "loyaltyEnrolled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "customers" ADD COLUMN "loyaltyJoinedAt" TIMESTAMP(3);
