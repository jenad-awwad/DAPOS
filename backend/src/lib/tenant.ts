import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "./errors.js";

type Db = PrismaClient | Prisma.TransactionClient;

export async function requireStoreCustomer(
  db: Db,
  storeId: string,
  customerId: string,
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, storeId },
  });
  if (!customer) {
    throw new AppError("Customer not found");
  }
  return customer;
}
