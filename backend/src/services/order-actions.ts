import {
  OrderStatus,
  PaymentStatus,
  StockMovementType,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { recordAudit } from "../lib/audit.js";
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
        throw new AppError("Order not found");
      }

      const now = new Date();
      const claimed = await tx.order.updateMany({
        where: { id: orderId, storeId, status: OrderStatus.COMPLETED },
        data: {
          status: OrderStatus.VOIDED,
          voidedAt: now,
          voidedById: userId,
        },
      });
      if (claimed.count !== 1) {
        throw new AppError("Only completed orders can be voided");
      }

      for (const item of order.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, storeId },
        });
        if (!product) continue;

        await tx.product.update({
          where: { id: product.id },
          data: { onStock: { increment: item.quantity } },
        });
        const { onStock: stockAfter } = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { onStock: true },
        });
        const stockBefore = stockAfter - item.quantity;

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

      if (order.customerId && order.loyaltyPointsEarned > 0) {
        const customer = await tx.customer.findFirst({
          where: { id: order.customerId, storeId },
        });
        if (customer) {
          const takeBack = Math.min(order.loyaltyPointsEarned, customer.loyaltyPoints);
          if (takeBack > 0) {
            await tx.customer.update({
              where: { id: customer.id },
              data: { loyaltyPoints: { decrement: takeBack } },
            });
          }
        }
      }

      await recordAudit(tx, {
        storeId,
        actorId: userId,
        action: "order.void",
        entityType: "order",
        entityId: order.id,
        details: { orderNumber: order.orderNumber },
      });

      const updated = await tx.order.findFirstOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          payments: true,
          projectMaterials: true,
          cashier: { select: { id: true, name: true } },
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
