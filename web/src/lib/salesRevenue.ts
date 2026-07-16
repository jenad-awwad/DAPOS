import type { Order, Payment } from "./types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isWithinPeriod(
  iso: string | null | undefined,
  from?: string,
  to?: string,
): boolean {
  if (!iso) return false;

  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return false;

  if (from && timestamp < new Date(from).getTime()) return false;
  if (to && timestamp > new Date(to).getTime()) return false;

  return true;
}

function paymentReceivedAt(payment: Payment): string | null {
  return payment.paidAt;
}

export type SalesRevenueBreakdown = {
  total: number;
  closedInvoices: number;
  projectPartialPayments: number;
};

export function calculateSalesRevenue(
  orders: Order[],
  from?: string,
  to?: string,
): SalesRevenueBreakdown {
  const closedInvoices = roundMoney(
    orders
      .filter((order) => order.status === "COMPLETED")
      .filter((order) =>
        isWithinPeriod(order.completedAt ?? order.createdAt, from, to),
      )
      .reduce((sum, order) => sum + order.total, 0),
  );

  const projectPartialPayments = roundMoney(
    orders
      .filter(
        (order) => order.orderType === "PROJECT" && order.status === "OPEN",
      )
      .flatMap((order) => order.payments ?? [])
      .filter((payment) => payment.status === "COMPLETED")
      .filter((payment) => isWithinPeriod(paymentReceivedAt(payment), from, to))
      .reduce((sum, payment) => sum + payment.amount, 0),
  );

  return {
    closedInvoices,
    projectPartialPayments,
    total: roundMoney(closedInvoices + projectPartialPayments),
  };
}
