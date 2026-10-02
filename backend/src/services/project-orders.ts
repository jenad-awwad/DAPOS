import {
  CalendarEventStatus,
  CalendarEventType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { syncProjectOrderVendorInvoices } from "./vendors.js";

type ProjectMaterialInput = {
  description: string;
  vendor: string;
  quantity: number;
  unitCost: number;
  notes?: string;
};

type CreateOpenProjectInput = {
  storeId: string;
  cashierId: string;
  projectTitle: string;
  sellQuantity: number;
  sellUnitPrice: number;
  materials?: ProjectMaterialInput[];
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  discountTotal?: number;
  scheduleAt?: Date;
  scheduleType?: CalendarEventType;
};

type UpdateOpenProjectInput = {
  storeId: string;
  orderId: string;
  userId: string;
  projectTitle?: string;
  sellQuantity?: number;
  sellUnitPrice?: number;
  materials?: ProjectMaterialInput[];
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  discountTotal?: number;
  scheduleAt?: Date;
  scheduleType?: CalendarEventType;
};

type SubmitProjectInput = {
  storeId: string;
  orderId: string;
  cashierId: string;
};

type RecordProjectPaymentInput = {
  storeId: string;
  orderId: string;
  userId: string;
  amount: number;
  paymentMethod: PaymentMethod;
};

function paidTotalFromPayments(
  payments: Array<{ status: PaymentStatus; amount: { toNumber(): number } }>,
): number {
  return roundMoney(
    payments
      .filter((payment) => payment.status === PaymentStatus.COMPLETED)
      .reduce((sum, payment) => sum + payment.amount.toNumber(), 0),
  );
}

const projectInclude = {
  projectMaterials: true,
  projectAdjustments: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" as const },
  },
  payments: true,
  calendarEvents: true,
  cashier: { select: { id: true, name: true, phone: true } },
  customer: true,
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

function buildMaterialLines(materials: ProjectMaterialInput[] = []) {
  return materials.map((material) => {
    if (!material.description.trim()) {
      throw new Error("Material description is required");
    }
    if (!material.vendor.trim()) {
      throw new Error("Vendor is required for each material");
    }
    if (material.quantity <= 0) {
      throw new Error("Material quantity must be greater than zero");
    }
    if (material.unitCost < 0) {
      throw new Error("Material unit cost cannot be negative");
    }

    const lineTotal = roundMoney(material.quantity * material.unitCost);
    return {
      description: material.description.trim(),
      vendor: material.vendor.trim(),
      quantity: material.quantity,
      unitCost: roundMoney(material.unitCost),
      lineTotal,
      notes: material.notes?.trim() || null,
    };
  });
}

function computeTotals(
  materialLines: ReturnType<typeof buildMaterialLines>,
  sellQuantity: number,
  sellUnitPrice: number,
  discountTotal = 0,
) {
  if (sellQuantity <= 0) {
    throw new Error("Sell quantity must be greater than zero");
  }
  if (sellUnitPrice < 0) {
    throw new Error("Sell unit price cannot be negative");
  }

  const materialCostTotal = roundMoney(
    materialLines.reduce((sum, line) => sum + line.lineTotal, 0),
  );
  const sellGross = roundMoney(sellQuantity * sellUnitPrice);
  const discount = roundMoney(discountTotal);
  const customerTotal = roundMoney(Math.max(sellGross - discount, 0));

  return {
    materialCostTotal,
    sellGross,
    discount,
    customerTotal,
  };
}

async function resolveCustomerId(
  tx: Prisma.TransactionClient,
  storeId: string,
  customerId?: string,
  customerName?: string,
  customerPhone?: string,
): Promise<string | undefined> {
  if (customerId) return customerId;

  if (customerName?.trim() && customerPhone?.trim()) {
    const existing = await tx.customer.findFirst({
      where: { storeId, phone: customerPhone.trim() },
    });
    if (existing) return existing.id;

    const created = await tx.customer.create({
      data: {
        storeId,
        name: customerName.trim(),
        phone: customerPhone.trim(),
      },
    });
    return created.id;
  }

  return undefined;
}

async function syncCalendarEvent(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    orderId: string;
    title: string;
    scheduleAt?: Date;
    scheduleType?: CalendarEventType;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    description?: string;
  },
) {
  const existing = await tx.calendarEvent.findFirst({
    where: { orderId: params.orderId, storeId: params.storeId },
  });

  if (!params.scheduleAt) {
    return existing;
  }

  const data = {
    title: params.title,
    type: params.scheduleType ?? CalendarEventType.SCHEDULED_ORDER,
    status: CalendarEventStatus.OPEN,
    startsAt: params.scheduleAt,
    customerId: params.customerId,
    customerName: params.customerName?.trim() || null,
    customerPhone: params.customerPhone?.trim() || null,
    description: params.description?.trim() || null,
  };

  if (existing) {
    return tx.calendarEvent.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.calendarEvent.create({
    data: {
      storeId: params.storeId,
      orderId: params.orderId,
      ...data,
    },
  });
}

export async function createOpenProject(input: CreateOpenProjectInput) {
  if (!input.projectTitle.trim()) {
    throw new Error("Project title is required");
  }

  const materialLines = buildMaterialLines(input.materials ?? []);
  const totals = computeTotals(
    materialLines,
    input.sellQuantity,
    input.sellUnitPrice,
    input.discountTotal ?? 0,
  );

  return prisma.$transaction(
    async (tx) => {
      const store = await tx.store.findFirst({
        where: { id: input.storeId, isActive: true },
      });
      if (!store) {
        throw new Error("Store not found");
      }

      const customerId = await resolveCustomerId(
        tx,
        input.storeId,
        input.customerId,
        input.customerName,
        input.customerPhone,
      );

      const orderNumber = await nextOrderNumber(tx, input.storeId);

      const order = await tx.order.create({
        data: {
          storeId: input.storeId,
          cashierId: input.cashierId,
          customerId,
          orderNumber,
          orderType: OrderType.PROJECT,
          projectTitle: input.projectTitle.trim(),
          projectSellQuantity: input.sellQuantity,
          projectSellUnitPrice: roundMoney(input.sellUnitPrice),
          status: OrderStatus.OPEN,
          subtotal: totals.materialCostTotal,
          taxAmount: 0,
          discountTotal: totals.discount,
          total: totals.customerTotal,
          notes: input.notes?.trim(),
          projectMaterials:
            materialLines.length > 0
              ? { create: materialLines }
              : undefined,
        },
        include: projectInclude,
      });

      if (input.scheduleAt) {
        const customer = customerId
          ? await tx.customer.findFirst({ where: { id: customerId } })
          : null;

        await syncCalendarEvent(tx, {
          storeId: input.storeId,
          orderId: order.id,
          title: input.projectTitle.trim(),
          scheduleAt: input.scheduleAt,
          scheduleType: input.scheduleType,
          customerId,
          customerName: customer?.name ?? input.customerName,
          customerPhone: customer?.phone ?? input.customerPhone,
          description: input.notes,
        });
      }

      await syncProjectOrderVendorInvoices(
        tx,
        input.storeId,
        order.id,
        order.orderNumber,
        order.createdAt,
      );

      return tx.order.findFirstOrThrow({
        where: { id: order.id },
        include: projectInclude,
      });
    },
    { timeout: 20000 },
  );
}

export async function updateOpenProject(input: UpdateOpenProjectInput) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: input.orderId,
          storeId: input.storeId,
          orderType: OrderType.PROJECT,
          status: OrderStatus.OPEN,
        },
        include: {
          projectMaterials: true,
          calendarEvents: true,
          customer: true,
        },
      });

      if (!order) {
        throw new Error("Open project not found");
      }

      const adjustments: string[] = [];
      const materialLines =
        input.materials !== undefined
          ? buildMaterialLines(input.materials)
          : order.projectMaterials.map((line) => ({
              description: line.description,
              vendor: line.vendor,
              quantity: line.quantity.toNumber(),
              unitCost: line.unitCost.toNumber(),
              lineTotal: line.lineTotal.toNumber(),
              notes: line.notes,
            }));

      const sellQuantity =
        input.sellQuantity ?? order.projectSellQuantity?.toNumber() ?? 1;
      const sellUnitPrice =
        input.sellUnitPrice ?? order.projectSellUnitPrice?.toNumber() ?? 0;
      const discountTotal =
        input.discountTotal ?? order.discountTotal.toNumber();

      const totals = computeTotals(
        materialLines,
        sellQuantity,
        sellUnitPrice,
        discountTotal,
      );

      if (
        input.projectTitle !== undefined &&
        input.projectTitle.trim() !== order.projectTitle
      ) {
        adjustments.push(
          `Title changed from "${order.projectTitle ?? ""}" to "${input.projectTitle.trim()}"`,
        );
      }

      if (
        input.sellQuantity !== undefined &&
        sellQuantity !== (order.projectSellQuantity?.toNumber() ?? 1)
      ) {
        adjustments.push(
          `Sell quantity changed from ${order.projectSellQuantity?.toNumber() ?? 1} to ${sellQuantity}`,
        );
      }

      if (
        input.sellUnitPrice !== undefined &&
        sellUnitPrice !== (order.projectSellUnitPrice?.toNumber() ?? 0)
      ) {
        adjustments.push(
          `Sell unit price changed from ${order.projectSellUnitPrice?.toNumber() ?? 0} to ${sellUnitPrice}`,
        );
      }

      if (input.materials !== undefined) {
        adjustments.push(
          `Materials updated (${materialLines.length} line${materialLines.length === 1 ? "" : "s"})`,
        );
      }

      if (
        input.discountTotal !== undefined &&
        discountTotal !== order.discountTotal.toNumber()
      ) {
        adjustments.push(
          `Discount changed from ${order.discountTotal.toNumber()} to ${discountTotal}`,
        );
      }

      const customerId = await resolveCustomerId(
        tx,
        input.storeId,
        input.customerId ?? order.customerId ?? undefined,
        input.customerName,
        input.customerPhone,
      );

      if (input.materials !== undefined) {
        await tx.orderProjectMaterial.deleteMany({ where: { orderId: order.id } });
        if (materialLines.length > 0) {
          await tx.orderProjectMaterial.createMany({
            data: materialLines.map((line) => ({
              orderId: order.id,
              ...line,
            })),
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          ...(input.projectTitle !== undefined
            ? { projectTitle: input.projectTitle.trim() }
            : {}),
          projectSellQuantity: sellQuantity,
          projectSellUnitPrice: roundMoney(sellUnitPrice),
          customerId,
          subtotal: totals.materialCostTotal,
          discountTotal: totals.discount,
          total: totals.customerTotal,
          ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
        },
        include: projectInclude,
      });

      if (adjustments.length > 0) {
        await tx.orderProjectAdjustment.create({
          data: {
            orderId: order.id,
            userId: input.userId,
            note: adjustments.join("; "),
          },
        });
      }

      if (input.scheduleAt !== undefined) {
        const customer = customerId
          ? await tx.customer.findFirst({ where: { id: customerId } })
          : order.customer;

        await syncCalendarEvent(tx, {
          storeId: input.storeId,
          orderId: order.id,
          title: input.projectTitle?.trim() ?? order.projectTitle ?? order.orderNumber,
          scheduleAt: input.scheduleAt,
          scheduleType: input.scheduleType,
          customerId: customerId ?? undefined,
          customerName: customer?.name ?? input.customerName,
          customerPhone: customer?.phone ?? input.customerPhone,
          description: input.notes ?? order.notes ?? undefined,
        });

        if (input.scheduleAt) {
          await tx.orderProjectAdjustment.create({
            data: {
              orderId: order.id,
              userId: input.userId,
              note: `Scheduled for ${input.scheduleAt.toISOString()}`,
            },
          });
        }
      }

      await syncProjectOrderVendorInvoices(
        tx,
        input.storeId,
        order.id,
        order.orderNumber,
        order.createdAt,
      );

      return tx.order.findFirstOrThrow({
        where: { id: updated.id },
        include: projectInclude,
      });
    },
    { timeout: 20000 },
  );
}

export async function recordProjectPayment(input: RecordProjectPaymentInput) {
  if (input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: input.orderId,
          storeId: input.storeId,
          orderType: OrderType.PROJECT,
          status: OrderStatus.OPEN,
        },
        include: { payments: true },
      });

      if (!order) {
        throw new Error("Open project not found");
      }

      const totalDue = order.total.toNumber();
      const alreadyPaid = paidTotalFromPayments(order.payments);
      const balanceDue = roundMoney(totalDue - alreadyPaid);

      if (balanceDue <= 0) {
        throw new Error("This project is already fully paid");
      }

      const amount = roundMoney(input.amount);
      if (amount > balanceDue) {
        throw new Error(`Payment cannot exceed outstanding balance (${balanceDue})`);
      }

      const now = new Date();

      await tx.payment.create({
        data: {
          orderId: order.id,
          method: input.paymentMethod,
          status: PaymentStatus.COMPLETED,
          amount,
          paidAt: now,
        },
      });

      await tx.orderProjectAdjustment.create({
        data: {
          orderId: order.id,
          userId: input.userId,
          note: `Partial payment recorded: ${amount} via ${input.paymentMethod}`,
        },
      });

      return tx.order.findFirstOrThrow({
        where: { id: order.id },
        include: projectInclude,
      });
    },
    { timeout: 20000 },
  );
}

export async function submitOpenProject(input: SubmitProjectInput) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: input.orderId,
          storeId: input.storeId,
          orderType: OrderType.PROJECT,
          status: OrderStatus.OPEN,
        },
        include: { payments: true, calendarEvents: true },
      });

      if (!order) {
        throw new Error("Open project not found");
      }

      const totalDue = order.total.toNumber();
      const paidTotal = paidTotalFromPayments(order.payments);
      const balanceDue = roundMoney(totalDue - paidTotal);

      if (balanceDue > 0) {
        throw new Error(
          `Outstanding balance of ${balanceDue}. Record partial payments until fully paid, then submit.`,
        );
      }

      const now = new Date();

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: now,
        },
        include: projectInclude,
      });

      await tx.calendarEvent.updateMany({
        where: { orderId: order.id, storeId: input.storeId },
        data: { status: CalendarEventStatus.COMPLETED },
      });

      await tx.orderProjectAdjustment.create({
        data: {
          orderId: order.id,
          userId: input.cashierId,
          note: `Project submitted — fully paid (${paidTotal})`,
        },
      });

      if (order.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: order.customerId, storeId: input.storeId },
        });
        if (customer?.loyaltyEnrolled) {
          await tx.customer.update({
            where: { id: customer.id },
            data: { loyaltyPoints: { increment: Math.floor(paidTotal) } },
          });
        }
      }

      return updated;
    },
    { timeout: 20000 },
  );
}

// Backward-compatible alias used by routes during transition
export async function createProjectSale(input: CreateOpenProjectInput & {
  paymentMethod?: PaymentMethod;
  sellingTotal?: number;
}) {
  if (input.paymentMethod) {
    const order = await createOpenProject(input);
    await recordProjectPayment({
      storeId: input.storeId,
      orderId: order.id,
      userId: input.cashierId,
      amount: order.total.toNumber(),
      paymentMethod: input.paymentMethod,
    });
    return submitOpenProject({
      storeId: input.storeId,
      orderId: order.id,
      cashierId: input.cashierId,
    });
  }

  return createOpenProject(input);
}
