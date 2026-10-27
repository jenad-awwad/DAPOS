import { StockMovementType, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { recordAudit } from "../lib/audit.js";

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
    throw new AppError("Quantity cannot be zero");
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
      throw new AppError("Product not found");
    }

    if (input.quantity < 0) {
      const res = await tx.product.updateMany({
        where: {
          id: product.id,
          storeId: input.storeId,
          onStock: { gte: -input.quantity },
        },
        data: { onStock: { decrement: -input.quantity } },
      });
      if (res.count !== 1) {
        throw new AppError("Stock cannot go below zero");
      }
    } else {
      await tx.product.update({
        where: { id: product.id },
        data: { onStock: { increment: input.quantity } },
      });
    }

    const { onStock: stockAfter } = await tx.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { onStock: true },
    });
    const stockBefore = stockAfter - input.quantity;

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

    await recordAudit(tx, {
      storeId: input.storeId,
      actorId: input.userId,
      action: "stock.adjust",
      entityType: "product",
      entityId: product.id,
      details: { quantity: input.quantity, type: input.type },
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
