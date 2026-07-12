-- Replace PaymentMethod enum: add CHEQUE, DEBIT, BREAKAGE, DELIVERY; remove MOBILE, OTHER

CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'CARD', 'CHEQUE', 'DEBIT', 'BREAKAGE', 'DELIVERY');

ALTER TABLE "payments"
  ALTER COLUMN "method" TYPE "PaymentMethod_new"
  USING (
    CASE "method"::text
      WHEN 'MOBILE' THEN 'CARD'::"PaymentMethod_new"
      WHEN 'OTHER' THEN 'DEBIT'::"PaymentMethod_new"
      ELSE "method"::text::"PaymentMethod_new"
    END
  );

DROP TYPE "PaymentMethod";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
