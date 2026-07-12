import {
  OrderStatus,
  PaymentStatus,
  StockMovementType,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getOrder } from "./orders.js";

export async function voidOrder(
  storeId: string,
  orderId: string,
  userId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, storeId },
        include: { items: true, payments: true },
      });

      if (!order) {
        throw new Error("Order not found");
      }

      if (order.status !== OrderStatus.COMPLETED) {
        throw new Error("Only completed orders can be voided");
      }

      const now = new Date();

      for (const item of order.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, storeId },
        });
        if (!product) continue;

        const stockBefore = product.onStock;
        const stockAfter = stockBefore + item.quantity;

        await tx.product.update({
          where: { id: product.id },
          data: { onStock: stockAfter },
        });

        await tx.stockMovement.create({
          data: {
            storeId,
            productId: product.id,
            userId,
            type: StockMovementType.VOID,
            quantity: item.quantity,
            stockBefore,
            stockAfter,
            orderId: order.id,
            reason: `Void ${order.orderNumber}`,
          },
        });
      }

      await tx.payment.updateMany({
        where: { orderId: order.id },
        data: { status: PaymentStatus.REFUNDED },
      });

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.VOIDED,
          voidedAt: now,
        },
        include: {
          items: true,
          payments: true,
          projectMaterials: true,
          cashier: { select: { id: true, name: true, phone: true } },
          customer: true,
        },
      });

      return updated;
    },
    { timeout: 20000 },
  );
}

export async function getOrderById(storeId: string, orderId: string) {
  return getOrder(storeId, orderId);
}
