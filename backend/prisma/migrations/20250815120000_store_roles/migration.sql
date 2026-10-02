-- CreateTable
CREATE TABLE "store_roles" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "systemCode" "UserRole",
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_roles_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "storeRoleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "store_roles_storeId_name_key" ON "store_roles"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "store_roles_storeId_systemCode_key" ON "store_roles"("storeId", "systemCode");

-- CreateIndex
CREATE INDEX "store_roles_storeId_idx" ON "store_roles"("storeId");

-- AddForeignKey
ALTER TABLE "store_roles" ADD CONSTRAINT "store_roles_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_storeRoleId_fkey" FOREIGN KEY ("storeRoleId") REFERENCES "store_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
