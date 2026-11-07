import { AppError } from "../lib/errors.js";
import {
  CalendarEventStatus,
  CalendarEventType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";
import { assertStoreAttachmentKey } from "../lib/object-storage.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreCustomer } from "../lib/tenant.js";
import { nextOrderNumber } from "./order-numbers.js";
import { syncProjectOrderVendorInvoices } from "./vendors.js";

type ProjectMaterialInput = {
  id?: string;
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
  attachmentKey?: string | null;
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
  attachmentKey?: string | null;
  discountTotal?: number;
  scheduleAt?: Date;
  scheduleType?: CalendarEventType;
  /** Keep stored unit costs. New lines are saved at zero. */
  preserveUnitCosts?: boolean;
  /** Change unit costs on the existing lines only. */
  unitCostsOnly?: boolean;
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
  cashier: { select: { id: true, name: true } },
  customer: true,
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildMaterialLines(materials: ProjectMaterialInput[] = []) {
  return materials.map((material) => {
    if (!material.description.trim()) {
      throw new AppError("Material description is required");
    }
    if (!material.vendor.trim()) {
      throw new AppError("Vendor is required for each material");
    }
    if (material.quantity <= 0) {
      throw new AppError("Material quantity must be greater than zero");
    }
    if (material.unitCost < 0) {
      throw new AppError("Material unit cost cannot be negative");
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
    throw new AppError("Sell quantity must be greater than zero");
  }
  if (sellUnitPrice < 0) {
    throw new AppError("Sell unit price cannot be negative");
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

const ACTIVITY_LABELS: Record<string, string> = {
  SCHEDULED_ORDER: "Scheduled order",
  INSTALLATION: "Installation",
  DELIVERY: "Delivery",
  ACTIVITY: "Activity",
  MEETING: "Meeting",
  OTHER: "Other",
};

function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] ?? type;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHEQUE: "Cheque",
  DEBIT: "Debit",
  BREAKAGE: "Breakage",
  DELIVERY: "Delivery",
};

function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method;
}

function clip(value: string, max = 160): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function sameQuantity(left: number, right: number): boolean {
  return Math.round(left * 1000) === Math.round(right * 1000);
}

type MaterialSnapshot = {
  description: string;
  vendor: string;
  quantity: number;
  unitCost: number;
};

function describeMaterialChanges(before: MaterialSnapshot[], after: MaterialSnapshot[]): string[] {
  const notes: string[] = [];
  const used = new Set<number>();

  for (const next of after) {
    const index = before.findIndex(
      (prev, prevIndex) =>
        !used.has(prevIndex) &&
        prev.description === next.description &&
        prev.vendor === next.vendor,
    );
    if (index < 0) {
      notes.push(
        `Material added: ${next.description} from ${next.vendor}, ${next.quantity} × ${next.unitCost}`,
      );
      continue;
    }
    used.add(index);
    const prev = before[index]!;
    const parts: string[] = [];
    if (!sameQuantity(prev.quantity, next.quantity)) {
      parts.push(`quantity ${prev.quantity} → ${next.quantity}`);
    }
    if (roundMoney(prev.unitCost) !== roundMoney(next.unitCost)) {
      parts.push(`price ${prev.unitCost} → ${next.unitCost}`);
    }
    if (parts.length > 0) {
      notes.push(`Material "${next.description}" (${next.vendor}): ${parts.join(", ")}`);
    }
  }

  before.forEach((prev, index) => {
    if (!used.has(index)) {
      notes.push(`Material removed: ${prev.description} from ${prev.vendor}`);
    }
  });

  return notes;
}

async function resolveCustomerId(
  tx: Prisma.TransactionClient,
  storeId: string,
  customerId?: string,
  customerName?: string,
  customerPhone?: string,
): Promise<string | undefined> {
  if (customerId) {
    const customer = await requireStoreCustomer(tx, storeId, customerId);
    return customer.id;
  }

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

  const data = {
    title: params.title,
    type: params.scheduleType ?? existing?.type ?? CalendarEventType.SCHEDULED_ORDER,
    status:
      existing?.status === CalendarEventStatus.COMPLETED
        ? CalendarEventStatus.COMPLETED
        : CalendarEventStatus.OPEN,
    startsAt: params.scheduleAt ?? existing?.startsAt ?? new Date(),
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
    throw new AppError("Project title is required");
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
        throw new AppError("Store not found");
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
          attachmentKey: assertStoreAttachmentKey(
            input.storeId,
            input.attachmentKey,
          ),
          projectMaterials:
            materialLines.length > 0
              ? { create: materialLines }
              : undefined,
        },
        include: projectInclude,
      });

      const customer = customerId
        ? await tx.customer.findFirst({ where: { id: customerId, storeId: input.storeId } })
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

      const created: string[] = [`Project created: ${input.projectTitle.trim()}`];
      if (customer) {
        created.push(
          `customer ${customer.name}${customer.phone ? ` (${customer.phone})` : ""}`,
        );
      }
      if (materialLines.length > 0) {
        created.push(
          `${materialLines.length} material line${materialLines.length === 1 ? "" : "s"}`,
        );
      }
      created.push(`customer total ${totals.customerTotal}`);
      if (input.attachmentKey) created.push("photo attached");
      if (input.scheduleAt) {
        created.push(
          `scheduled for ${input.scheduleAt.toISOString()}${
            input.scheduleType ? ` (${activityLabel(input.scheduleType)})` : ""
          }`,
        );
      }
      await tx.orderProjectAdjustment.create({
        data: {
          orderId: order.id,
          userId: input.cashierId,
          note: created.join("; "),
        },
      });

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
        throw new AppError("Open project not found");
      }

      const adjustments: string[] = [];
      let materialsInput = input.materials;
      if (materialsInput && input.unitCostsOnly) {
        const costById = new Map(
          materialsInput
            .filter((line) => line.id)
            .map((line) => [line.id as string, line.unitCost]),
        );
        materialsInput = order.projectMaterials.map((line) => ({
          description: line.description,
          vendor: line.vendor,
          quantity: line.quantity.toNumber(),
          unitCost: costById.get(line.id) ?? line.unitCost.toNumber(),
          notes: line.notes ?? undefined,
        }));
      } else if (materialsInput && input.preserveUnitCosts) {
        const costById = new Map(
          order.projectMaterials.map((line) => [line.id, line.unitCost.toNumber()]),
        );
        materialsInput = materialsInput.map((line) => ({
          ...line,
          unitCost: line.id && costById.has(line.id) ? costById.get(line.id)! : 0,
        }));
      }

      const materialLines =
        materialsInput !== undefined
          ? buildMaterialLines(materialsInput)
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
        input.projectTitle.trim() !== (order.projectTitle ?? "")
      ) {
        adjustments.push(
          `Title changed from "${order.projectTitle ?? ""}" to "${input.projectTitle.trim()}"`,
        );
      }

      if (
        input.sellQuantity !== undefined &&
        !sameQuantity(sellQuantity, order.projectSellQuantity?.toNumber() ?? 1)
      ) {
        adjustments.push(
          `Sell quantity changed from ${order.projectSellQuantity?.toNumber() ?? 1} to ${sellQuantity}`,
        );
      }

      if (
        input.sellUnitPrice !== undefined &&
        roundMoney(sellUnitPrice) !== roundMoney(order.projectSellUnitPrice?.toNumber() ?? 0)
      ) {
        adjustments.push(
          `Sell unit price changed from ${order.projectSellUnitPrice?.toNumber() ?? 0} to ${sellUnitPrice}`,
        );
      }

      if (materialsInput !== undefined) {
        adjustments.push(
          ...describeMaterialChanges(
            order.projectMaterials.map((line) => ({
              description: line.description,
              vendor: line.vendor,
              quantity: line.quantity.toNumber(),
              unitCost: line.unitCost.toNumber(),
            })),
            materialLines,
          ),
        );
      }

      if (
        input.discountTotal !== undefined &&
        roundMoney(discountTotal) !== roundMoney(order.discountTotal.toNumber())
      ) {
        adjustments.push(
          `Discount changed from ${order.discountTotal.toNumber()} to ${discountTotal}`,
        );
      }

      if (roundMoney(order.total.toNumber()) !== totals.customerTotal) {
        adjustments.push(
          `Customer total changed from ${order.total.toNumber()} to ${totals.customerTotal}`,
        );
      }

      if (input.notes !== undefined && input.notes.trim() !== (order.notes ?? "").trim()) {
        const nextNotes = input.notes.trim();
        adjustments.push(
          nextNotes ? `Notes changed to "${clip(nextNotes)}"` : "Notes cleared",
        );
      }

      if (input.attachmentKey !== undefined) {
        const nextKey = assertStoreAttachmentKey(input.storeId, input.attachmentKey);
        if (nextKey !== (order.attachmentKey ?? null)) {
          if (!order.attachmentKey && nextKey) adjustments.push("Photo attached");
          else if (order.attachmentKey && !nextKey) adjustments.push("Photo removed");
          else adjustments.push("Photo replaced");
        }
      }

      const customerId = await resolveCustomerId(
        tx,
        input.storeId,
        input.customerId ?? order.customerId ?? undefined,
        input.customerName,
        input.customerPhone,
      );

      if (
        input.customerId !== undefined ||
        input.customerName !== undefined ||
        input.customerPhone !== undefined
      ) {
        const nextCustomer = customerId
          ? await tx.customer.findFirst({
              where: { id: customerId, storeId: input.storeId },
            })
          : null;
        const prevName = order.customer?.name ?? "";
        const prevPhone = order.customer?.phone ?? "";
        const nextName = nextCustomer?.name ?? "";
        const nextPhone = nextCustomer?.phone ?? "";
        if (prevName !== nextName || prevPhone !== nextPhone) {
          const from = prevName
            ? `"${prevName}${prevPhone ? ` (${prevPhone})` : ""}"`
            : "none";
          const to = nextName
            ? `"${nextName}${nextPhone ? ` (${nextPhone})` : ""}"`
            : "none";
          adjustments.push(`Customer changed from ${from} to ${to}`);
        }
      }

      if (materialsInput !== undefined) {
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
          ...(input.attachmentKey !== undefined
            ? {
                attachmentKey: assertStoreAttachmentKey(
                  input.storeId,
                  input.attachmentKey,
                ),
              }
            : {}),
        },
        include: projectInclude,
      });

      const scheduledCustomer = customerId
        ? await tx.customer.findFirst({ where: { id: customerId, storeId: input.storeId } })
        : order.customer;

      const previousEvent = [...order.calendarEvents].sort(
        (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
      )[0];
      if (input.scheduleAt) {
        const previousStart = previousEvent?.startsAt.getTime();
        const scheduleChanged =
          previousStart == null ||
          Math.floor(previousStart / 60_000) !== Math.floor(input.scheduleAt.getTime() / 60_000);
        if (scheduleChanged) {
          adjustments.push(
            previousEvent
              ? `Schedule changed from ${previousEvent.startsAt.toISOString()} to ${input.scheduleAt.toISOString()}`
              : `Scheduled for ${input.scheduleAt.toISOString()}`,
          );
        }
      }
      if (
        input.scheduleType &&
        previousEvent &&
        input.scheduleType !== previousEvent.type
      ) {
        adjustments.push(
          `Activity type changed from ${activityLabel(previousEvent.type)} to ${activityLabel(input.scheduleType)}`,
        );
      }

      if (adjustments.length > 0) {
        await tx.orderProjectAdjustment.create({
          data: {
            orderId: order.id,
            userId: input.userId,
            note: adjustments.join("; "),
          },
        });
      }

      await syncCalendarEvent(tx, {
        storeId: input.storeId,
        orderId: order.id,
        title: input.projectTitle?.trim() ?? order.projectTitle ?? order.orderNumber,
        scheduleAt: input.scheduleAt,
        scheduleType: input.scheduleType,
        customerId: customerId ?? undefined,
        customerName: scheduledCustomer?.name ?? input.customerName,
        customerPhone: scheduledCustomer?.phone ?? input.customerPhone,
        description: input.notes ?? order.notes ?? undefined,
      });

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
    throw new AppError("Payment amount must be greater than zero");
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
        throw new AppError("Open project not found");
      }

      const totalDue = order.total.toNumber();
      const alreadyPaid = paidTotalFromPayments(order.payments);
      const balanceDue = roundMoney(totalDue - alreadyPaid);

      if (balanceDue <= 0) {
        throw new AppError("This project is already fully paid");
      }

      const amount = roundMoney(input.amount);
      if (amount > balanceDue) {
        throw new AppError(`Payment cannot exceed outstanding balance (${balanceDue})`);
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
          note: `Partial payment recorded: ${amount} via ${paymentLabel(input.paymentMethod)}; balance due ${roundMoney(balanceDue - amount)}`,
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
        throw new AppError("Open project not found");
      }

      const totalDue = roundMoney(order.total.toNumber());
      const paidTotal = paidTotalFromPayments(order.payments);

      if (paidTotal !== totalDue) {
        throw new AppError(
          `Payments (${paidTotal}) must equal the customer price (${totalDue}) before this project can be closed.`,
        );
      }

      const now = new Date();
      let pointsEarned = 0;
      if (order.customerId) {
        const enrolled = await tx.customer.findFirst({
          where: { id: order.customerId, storeId: input.storeId, loyaltyEnrolled: true },
        });
        if (enrolled) pointsEarned = Math.floor(paidTotal);
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: now,
          loyaltyPointsEarned: pointsEarned,
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
        if (customer?.loyaltyEnrolled && pointsEarned > 0) {
          await tx.customer.update({
            where: { id: customer.id },
            data: { loyaltyPoints: { increment: pointsEarned } },
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
