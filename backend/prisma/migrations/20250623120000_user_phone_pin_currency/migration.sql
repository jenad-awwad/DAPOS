-- Currency enum for store settings (ILS, USD, JOD)
CREATE TYPE "Currency" AS ENUM ('ILS', 'USD', 'JOD');

ALTER TABLE "stores" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "stores"
  ALTER COLUMN "currency" TYPE "Currency" USING ("currency"::"Currency");
ALTER TABLE "stores" ALTER COLUMN "currency" SET DEFAULT 'USD';

-- Login with phone + PIN (remove email/password)
ALTER TABLE "users" ADD COLUMN "phone" TEXT;

UPDATE "users" SET "phone" = '0501234567' WHERE "email" = 'admin@dapos.local';
UPDATE "users" SET "phone" = '0500000000' WHERE "phone" IS NULL;

ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "pin" SET NOT NULL;

DROP INDEX "users_storeId_email_key";

ALTER TABLE "users" DROP COLUMN "email";
ALTER TABLE "users" DROP COLUMN "passwordHash";

CREATE UNIQUE INDEX "users_storeId_phone_key" ON "users"("storeId", "phone");
