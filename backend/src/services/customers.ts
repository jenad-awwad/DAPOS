import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type CustomerStatsFilters = {
  search?: string;
  loyaltyOnly?: boolean;
  nonLoyaltyOnly?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  orderMonth?: string;
};

export type CustomerStatsRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  loyaltyEnrolled: boolean;
  loyaltyPoints: number;
  loyaltyJoinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  firstOrderDate: string | null;
  ordersThisMonth: number;
  totalOrders: number;
  totalOrderValue: number;
};

export type CustomerStatsSummary = {
  customerCount: number;
  totalOrders: number;
  totalOrderValue: number;
  ordersThisMonth: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseOrderMonth(orderMonth: string): { start: Date; end: Date; label: string } {
  const [yearStr, monthStr] = orderMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

function currentMonthRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

export async function listCustomersWithStats(
  storeId: string,
  filters: CustomerStatsFilters = {},
): Promise<{
  customers: CustomerStatsRow[];
  summary: CustomerStatsSummary;
  orderMonthLabel: string;
}> {
  const { search, loyaltyOnly, nonLoyaltyOnly, createdFrom, createdTo, orderMonth } = filters;

  const customers = await prisma.customer.findMany({
    where: {
      storeId,
      ...(loyaltyOnly ? { loyaltyEnrolled: true } : {}),
      ...(nonLoyaltyOnly ? { loyaltyEnrolled: false } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom ? { gte: createdFrom } : {}),
              ...(createdTo ? { lte: createdTo } : {}),
            },
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  const customerIds = customers.map((c) => c.id);
  const monthRange = orderMonth
    ? parseOrderMonth(orderMonth)
    : currentMonthRange();

  const orders =
    customerIds.length === 0
      ? []
      : await prisma.order.findMany({
          where: {
            storeId,
            status: OrderStatus.COMPLETED,
            customerId: { in: customerIds },
          },
          select: {
            customerId: true,
            total: true,
            createdAt: true,
            completedAt: true,
          },
        });

  type Agg = {
    firstOrderDate: Date | null;
    totalOrders: number;
    totalOrderValue: number;
    ordersThisMonth: number;
  };

  const statsMap = new Map<string, Agg>();

  for (const order of orders) {
    if (!order.customerId) continue;

    const soldAt = order.completedAt ?? order.createdAt;
    const existing = statsMap.get(order.customerId) ?? {
      firstOrderDate: null,
      totalOrders: 0,
      totalOrderValue: 0,
      ordersThisMonth: 0,
    };

    existing.totalOrders += 1;
    existing.totalOrderValue = roundMoney(
      existing.totalOrderValue + order.total.toNumber(),
    );

    if (!existing.firstOrderDate || soldAt < existing.firstOrderDate) {
      existing.firstOrderDate = soldAt;
    }

    if (soldAt >= monthRange.start && soldAt <= monthRange.end) {
      existing.ordersThisMonth += 1;
    }

    statsMap.set(order.customerId, existing);
  }

  const rows: CustomerStatsRow[] = customers.map((customer) => {
    const stats = statsMap.get(customer.id) ?? {
      firstOrderDate: null,
      totalOrders: 0,
      totalOrderValue: 0,
      ordersThisMonth: 0,
    };

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      notes: customer.notes,
      loyaltyEnrolled: customer.loyaltyEnrolled,
      loyaltyPoints: customer.loyaltyPoints,
      loyaltyJoinedAt: customer.loyaltyJoinedAt?.toISOString() ?? null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      firstOrderDate: stats.firstOrderDate?.toISOString() ?? null,
      ordersThisMonth: stats.ordersThisMonth,
      totalOrders: stats.totalOrders,
      totalOrderValue: stats.totalOrderValue,
    };
  });

  const summary: CustomerStatsSummary = rows.reduce(
    (acc, row) => ({
      customerCount: acc.customerCount + 1,
      totalOrders: acc.totalOrders + row.totalOrders,
      totalOrderValue: roundMoney(acc.totalOrderValue + row.totalOrderValue),
      ordersThisMonth: acc.ordersThisMonth + row.ordersThisMonth,
    }),
    {
      customerCount: 0,
      totalOrders: 0,
      totalOrderValue: 0,
      ordersThisMonth: 0,
    },
  );

  return {
    customers: rows,
    summary,
    orderMonthLabel: monthRange.label,
  };
}
