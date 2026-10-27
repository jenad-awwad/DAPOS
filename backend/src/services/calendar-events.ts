import { AppError } from "../lib/errors.js";
import { CalendarEventStatus, CalendarEventType, OrderType, PaymentMethod, PaymentStatus } from "@prisma/client";
import { assertStoreAttachmentKey } from "../lib/object-storage.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreCustomer } from "../lib/tenant.js";

type CreateCalendarEventInput = {
  storeId: string;
  title: string;
  type?: CalendarEventType;
  startsAt: Date;
  endsAt?: Date;
  allDay?: boolean;
  description?: string;
  price?: number;
  orderId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  attachmentKey?: string | null;
};

type UpdateCalendarEventInput = Partial<
  Omit<CreateCalendarEventInput, "storeId">
>;

const eventInclude = {
  payments: { orderBy: { paidAt: "asc" as const } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      orderType: true,
      projectTitle: true,
      total: true,
      status: true,
    },
  },
  customer: {
    select: { id: true, name: true, phone: true },
  },
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function paidTotal(
  payments: Array<{ amount: { toNumber(): number } }>,
): number {
  return roundMoney(payments.reduce((sum, payment) => sum + payment.amount.toNumber(), 0));
}

async function resolveCustomerId(
  storeId: string,
  customerId?: string,
  customerName?: string,
  customerPhone?: string,
) {
  if (customerId) {
    const customer = await requireStoreCustomer(prisma, storeId, customerId);
    return customer.id;
  }

  if (customerName?.trim() && customerPhone?.trim()) {
    const existing = await prisma.customer.findFirst({
      where: { storeId, phone: customerPhone.trim() },
    });
    if (existing) return existing.id;

    const created = await prisma.customer.create({
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

export async function listCalendarEvents(
  storeId: string,
  options: { from?: Date; to?: Date } = {},
) {
  const { from, to } = options;

  return prisma.calendarEvent.findMany({
    where: {
      storeId,
      ...(from || to
        ? {
            startsAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: eventInclude,
    orderBy: { startsAt: "asc" },
  });
}

export async function getCalendarEvent(storeId: string, eventId: string) {
  return prisma.calendarEvent.findFirst({
    where: { id: eventId, storeId },
    include: eventInclude,
  });
}

export async function createCalendarEvent(input: CreateCalendarEventInput) {
  if (!input.title.trim()) {
    throw new AppError("Event title is required");
  }

  if (!input.customerPhone?.trim()) {
    throw new AppError("Customer phone number is required");
  }

  if (!input.customerName?.trim() && !input.customerId) {
    throw new AppError("Customer name is required");
  }

  if (input.price !== undefined && input.price < 0) {
    throw new AppError("Activity price cannot be negative");
  }

  if (input.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, storeId: input.storeId },
    });
    if (!order) {
      throw new AppError("Linked order not found");
    }
  }

  const customerId = await resolveCustomerId(
    input.storeId,
    input.customerId,
    input.customerName,
    input.customerPhone,
  );

  return prisma.calendarEvent.create({
    data: {
      storeId: input.storeId,
      title: input.title.trim(),
      type: input.type ?? CalendarEventType.OTHER,
      status: CalendarEventStatus.OPEN,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay ?? false,
      description: input.description?.trim(),
      price: input.price !== undefined ? roundMoney(input.price) : null,
      orderId: input.orderId,
      customerId,
      customerName: input.customerName?.trim(),
      customerPhone: input.customerPhone?.trim(),
      attachmentKey: assertStoreAttachmentKey(input.storeId, input.attachmentKey),
    },
    include: eventInclude,
  });
}

export async function updateCalendarEvent(
  storeId: string,
  eventId: string,
  input: UpdateCalendarEventInput,
) {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, storeId },
    include: { payments: true },
  });
  if (!existing) {
    throw new AppError("Calendar event not found");
  }

  if (existing.status === CalendarEventStatus.COMPLETED) {
    throw new AppError("Completed activities cannot be edited");
  }

  if (input.price !== undefined && input.price < 0) {
    throw new AppError("Activity price cannot be negative");
  }

  if (input.price !== undefined) {
    const newPrice = roundMoney(input.price);
    const alreadyPaid = paidTotal(existing.payments);
    if (newPrice < alreadyPaid) {
      throw new AppError("Activity price cannot be less than payments already recorded");
    }
  }

  if (input.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, storeId },
    });
    if (!order) {
      throw new AppError("Linked order not found");
    }
  }

  const customerId = await resolveCustomerId(
    storeId,
    input.customerId ?? existing.customerId ?? undefined,
    input.customerName ?? existing.customerName ?? undefined,
    input.customerPhone ?? existing.customerPhone ?? undefined,
  );

  return prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.price !== undefined ? { price: roundMoney(input.price) } : {}),
      ...(input.orderId !== undefined ? { orderId: input.orderId || null } : {}),
      customerId: customerId ?? null,
      ...(input.customerName !== undefined
        ? { customerName: input.customerName?.trim() || null }
        : {}),
      ...(input.customerPhone !== undefined
        ? { customerPhone: input.customerPhone?.trim() || null }
        : {}),
      ...(input.attachmentKey !== undefined
        ? {
            attachmentKey: assertStoreAttachmentKey(storeId, input.attachmentKey),
          }
        : {}),
    },
    include: eventInclude,
  });
}

export async function recordCalendarEventPayment(
  storeId: string,
  eventId: string,
  input: { amount: number; paymentMethod: PaymentMethod },
) {
  if (input.amount <= 0) {
    throw new AppError("Payment amount must be greater than zero");
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, storeId, status: CalendarEventStatus.OPEN },
    include: { payments: true },
  });

  if (!existing) {
    throw new AppError("Open calendar activity not found");
  }

  const price = existing.price?.toNumber() ?? 0;
  if (price <= 0) {
    throw new AppError("Set an activity price before recording payments");
  }

  const alreadyPaid = paidTotal(existing.payments);
  const balanceDue = roundMoney(price - alreadyPaid);
  const amount = roundMoney(input.amount);

  if (balanceDue <= 0) {
    throw new AppError("This activity is already fully paid");
  }

  if (amount > balanceDue) {
    throw new AppError(`Payment cannot exceed outstanding balance (${balanceDue})`);
  }

  await prisma.calendarEventPayment.create({
    data: {
      calendarEventId: existing.id,
      method: input.paymentMethod,
      amount,
      paidAt: new Date(),
    },
  });

  return getCalendarEvent(storeId, eventId);
}

export async function completeCalendarEvent(storeId: string, eventId: string) {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, storeId },
    include: { payments: true },
  });
  if (!existing) {
    throw new AppError("Calendar event not found");
  }

  if (existing.status === CalendarEventStatus.COMPLETED) {
    throw new AppError("Activity is already completed");
  }

  if (existing.orderId) {
    const linkedOrder = await prisma.order.findFirst({
      where: { id: existing.orderId, storeId },
      include: { payments: true },
    });
    if (linkedOrder?.orderType === OrderType.PROJECT) {
      const totalDue = roundMoney(linkedOrder.total.toNumber());
      const paidTotal = roundMoney(
        linkedOrder.payments
          .filter((payment) => payment.status === PaymentStatus.COMPLETED)
          .reduce((sum, payment) => sum + payment.amount.toNumber(), 0),
      );
      if (paidTotal !== totalDue) {
        throw new AppError(
          `Payments (${paidTotal}) must equal the customer price (${totalDue}) before this project can be closed.`,
        );
      }
      throw new AppError(
        "Close this project from the project screen after it is fully paid. It stays on the calendar.",
      );
    }
  }

  const price = existing.price?.toNumber() ?? 0;
  if (price > 0) {
    const alreadyPaid = paidTotal(existing.payments);
    const balanceDue = roundMoney(price - alreadyPaid);
    if (balanceDue > 0) {
      throw new AppError(
        `Outstanding balance of ${balanceDue}. Record payments until fully paid before closing.`,
      );
    }
  }

  return prisma.calendarEvent.update({
    where: { id: eventId },
    data: { status: CalendarEventStatus.COMPLETED },
    include: eventInclude,
  });
}

export async function deleteCalendarEvent(storeId: string, eventId: string) {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, storeId },
  });
  if (!existing) {
    throw new AppError("Calendar event not found");
  }

  if (existing.status === CalendarEventStatus.COMPLETED) {
    throw new AppError("Completed activities cannot be deleted");
  }

  if (existing.orderId) {
    const linkedOrder = await prisma.order.findFirst({
      where: { id: existing.orderId, storeId },
      select: { orderType: true },
    });
    if (linkedOrder?.orderType === OrderType.PROJECT) {
      throw new AppError("A project stays on the calendar and cannot be removed from it.");
    }
  }

  await prisma.calendarEvent.delete({ where: { id: eventId } });
  return { deleted: true };
}
