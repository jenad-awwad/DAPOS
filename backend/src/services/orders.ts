import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  StockMovementType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type OrderItemInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
};

type CreateOrderInput = {
  storeId: string;
  cashierId: string;
  items: OrderItemInput[];
  paymentMethod: PaymentMethod;
  customerId?: string;
  notes?: string;
  discountTotal?: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  storeId: string,
): Promise<string> {
  const count = await tx.order.count({ where: { storeId } });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ORD-${date}-${String(count + 1).padStart(4, "0")}`;
}

export async function createSale(input: CreateOrderInput) {
  if (input.items.length === 0) {
    throw new Error("Order must include at least one item");
  }

  return prisma.$transaction(
    async (tx) => {
    const store = await tx.store.findFirst({
      where: { id: input.storeId, isActive: true },
    });
    if (!store) {
      throw new Error("Store not found");
    }

    const productIds = input.items.map((item) => item.productId);
    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        storeId: input.storeId,
        isActive: true,
      },
    });

    if (products.length !== productIds.length) {
      throw new Error("One or more products were not found");
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    let subtotal = 0;
    const lineItems: Array<{
      productId: string;
      productName: string;
      productSku: string;
      unitPrice: number;
      quantity: number;
      discount: number;
      lineTotal: number;
    }> = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error("Product not found");
      }
      if (item.quantity <= 0) {
        throw new Error("Quantity must be greater than zero");
      }
      if (product.onStock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      if (!product.isPriced) {
        throw new Error(`${product.name} is not priced yet`);
      }

      const unitPrice =
        item.unitPrice !== undefined
          ? roundMoney(item.unitPrice)
          : product.price.toNumber();
      if (unitPrice < 0) {
        throw new Error("Unit price cannot be negative");
      }
      const discount = item.discount ?? 0;
      const lineTotal = roundMoney(unitPrice * item.quantity - discount);
      subtotal += lineTotal;

      lineItems.push({
        productId: product.id,
        productName: product.name,
        productSku: product.sku ?? product.barcode,
        unitPrice,
        quantity: item.quantity,
        discount,
        lineTotal,
      });
    }

    subtotal = roundMoney(subtotal);
    const discountTotal = roundMoney(input.discountTotal ?? 0);
    const taxAmount = 0;
    const total = roundMoney(Math.max(subtotal - discountTotal, 0));
    const orderNumber = await nextOrderNumber(tx, input.storeId);
    const now = new Date();

    const order = await tx.order.create({
      data: {
        storeId: input.storeId,
        cashierId: input.cashierId,
        customerId: input.customerId,
        orderNumber,
        status: OrderStatus.COMPLETED,
        subtotal,
        taxAmount,
        discountTotal,
        total,
        notes: input.notes,
        completedAt: now,
        items: {
          create: lineItems.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            productSku: line.productSku,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            discount: line.discount,
            lineTotal: line.lineTotal,
          })),
        },
        payments: {
          create: {
            method: input.paymentMethod,
            status:
              input.paymentMethod === PaymentMethod.DEBIT
                ? PaymentStatus.PENDING
                : PaymentStatus.COMPLETED,
            amount: total,
            paidAt:
              input.paymentMethod === PaymentMethod.DEBIT ? null : now,
          },
        },
      },
      include: {
        items: true,
        payments: true,
        cashier: { select: { id: true, name: true, phone: true } },
      },
    });

    for (const line of lineItems) {
      const product = productMap.get(line.productId)!;
      const stockBefore = product.onStock;
      const stockAfter = stockBefore - line.quantity;

      await tx.product.update({
        where: { id: line.productId },
        data: { onStock: stockAfter },
      });

      await tx.stockMovement.create({
        data: {
          storeId: input.storeId,
          productId: line.productId,
          userId: input.cashierId,
          type: StockMovementType.SALE,
          quantity: -line.quantity,
          stockBefore,
          stockAfter,
          orderId: order.id,
        },
      });
    }

    if (input.customerId) {
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, storeId: input.storeId },
      });
      if (customer?.loyaltyEnrolled) {
        const pointsEarned = Math.floor(total);
        await tx.customer.update({
          where: { id: customer.id },
          data: { loyaltyPoints: { increment: pointsEarned } },
        });
      }
    }

    return order;
  },
    { timeout: 20000 },
  );
}

export async function listOrders(
  storeId: string,
  options: {
    limit?: number;
    orderNumber?: string;
    status?: OrderStatus;
    orderType?: OrderType;
    paymentOpen?: boolean;
    cashierId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {},
) {
  const {
    limit = 50,
    orderNumber,
    status,
    orderType,
    paymentOpen,
    cashierId,
    dateFrom,
    dateTo,
  } = options;

  const paymentOpenFilter =
    paymentOpen === true
      ? {
          OR: [
            { status: OrderStatus.OPEN },
            {
              orderType: OrderType.REGULAR,
              payments: { some: { method: PaymentMethod.DEBIT } },
            },
          ],
        }
      : paymentOpen === false
        ? {
            NOT: {
              OR: [
                { status: OrderStatus.OPEN },
                {
                  orderType: OrderType.REGULAR,
                  payments: { some: { method: PaymentMethod.DEBIT } },
                },
              ],
            },
          }
        : {};

  return prisma.order.findMany({
    where: {
      storeId,
      ...(orderNumber
        ? { orderNumber: { contains: orderNumber, mode: "insensitive" } }
        : {}),
      ...(status ? { status } : {}),
      ...(orderType ? { orderType } : {}),
      ...paymentOpenFilter,
      ...(cashierId ? { cashierId } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    },
    include: {
      items: true,
      payments: true,
      projectMaterials: true,
      projectAdjustments: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      cashier: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getOrder(storeId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, storeId },
    include: {
      items: true,
      payments: true,
      projectMaterials: true,
      projectAdjustments: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      cashier: { select: { id: true, name: true, phone: true } },
      customer: true,
    },
  });
}

export type ItemSalesLine = {
  id: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  sku: string | null;
  barcode: string;
  categoryName: string | null;
  quantity: number;
  unitPrice: number;
  cost: number | null;
  lineTotal: number;
  soldAt: string;
};

export async function getItemSalesReport(
  storeId: string,
  options: {
    search?: string;
    cashierId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {},
): Promise<{
  items: ItemSalesLine[];
  summary: { quantitySold: number; totalRevenue: number; totalCost: number };
}> {
  const { search, cashierId, dateFrom, dateTo } = options;

  const lineItems = await prisma.orderItem.findMany({
    where: {
      order: {
        storeId,
        status: OrderStatus.COMPLETED,
        ...(cashierId ? { cashierId } : {}),
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
      ...(search
        ? {
            OR: [
              { productName: { contains: search, mode: "insensitive" } },
              { productSku: { contains: search, mode: "insensitive" } },
              { product: { barcode: { contains: search } } },
              { product: { sku: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          completedAt: true,
        },
      },
      product: {
        select: {
          sku: true,
          barcode: true,
          cost: true,
          category: { select: { name: true } },
        },
      },
    },
    orderBy: { order: { createdAt: "desc" } },
  });

  const items: ItemSalesLine[] = lineItems.map((line) => {
    const soldAt = line.order.completedAt ?? line.order.createdAt;
    const unitCost = line.product?.cost?.toNumber() ?? null;

    return {
      id: line.id,
      orderId: line.order.id,
      orderNumber: line.order.orderNumber,
      productId: line.productId,
      productName: line.productName,
      sku: line.product?.sku ?? null,
      barcode: line.product?.barcode ?? line.productSku,
      categoryName: line.product?.category?.name ?? null,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toNumber(),
      cost: unitCost,
      lineTotal: line.lineTotal.toNumber(),
      soldAt: soldAt.toISOString(),
    };
  });

  const summary = items.reduce(
    (acc, row) => ({
      quantitySold: acc.quantitySold + row.quantity,
      totalRevenue: roundMoney(acc.totalRevenue + row.lineTotal),
      totalCost: roundMoney(
        acc.totalCost + (row.cost != null ? row.cost * row.quantity : 0),
      ),
    }),
    { quantitySold: 0, totalRevenue: 0, totalCost: 0 },
  );

  return { items, summary };
}
