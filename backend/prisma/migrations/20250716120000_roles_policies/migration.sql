-- AlterTable
ALTER TABLE "stores" ADD COLUMN "rolePolicies" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "customPolicies" JSONB;
