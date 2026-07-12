import { StockMovementType, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type AdjustStockInput = {
  storeId: string;
  productId: string;
  userId: string;
  quantity: number;
  type: "RESTOCK" | "ADJUSTMENT";
  reason?: string;
};

export async function adjustStock(input: AdjustStockInput) {
  if (input.quantity === 0) {
    throw new Error("Quantity cannot be zero");
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
        storeId: input.storeId,
        isActive: true,
      },
    });

    if (!product) {
      throw new Error("Product not found");
    }

    const stockBefore = product.onStock;
    const stockAfter = stockBefore + input.quantity;

    if (stockAfter < 0) {
      throw new Error("Stock cannot go below zero");
    }

    await tx.product.update({
      where: { id: product.id },
      data: { onStock: stockAfter },
    });

    const movement = await tx.stockMovement.create({
      data: {
        storeId: input.storeId,
        productId: product.id,
        userId: input.userId,
        type:
          input.type === "RESTOCK"
            ? StockMovementType.RESTOCK
            : StockMovementType.ADJUSTMENT,
        quantity: input.quantity,
        stockBefore,
        stockAfter,
        reason: input.reason,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        user: { select: { id: true, name: true } },
      },
    });

    return movement;
  });
}

export async function listStockMovements(
  storeId: string,
  options: { productId?: string; limit?: number } = {},
) {
  const where: Prisma.StockMovementWhereInput = { storeId };
  if (options.productId) where.productId = options.productId;

  return prisma.stockMovement.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 100,
  });
}
