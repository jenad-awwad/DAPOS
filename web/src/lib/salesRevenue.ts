import type { Order, Payment } from "./types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toMoney(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
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
  return payment.paidAt ?? payment.createdAt ?? null;
}

function isCompletedRegularInvoice(order: Order, from?: string, to?: string): boolean {
  return (
    order.status === "COMPLETED" &&
    (order.orderType ?? "REGULAR") === "REGULAR" &&
    isWithinPeriod(order.completedAt ?? order.createdAt, from, to)
  );
}

export type SalesRevenueBreakdown = {
  total: number;
  invoiceTotal: number;
  projectPayments: number;
};

/** Regular completed invoices plus all project payments received in the period. */
export function calculateSalesRevenue(
  orders: Order[],
  from?: string,
  to?: string,
): SalesRevenueBreakdown {
  const invoiceTotal = roundMoney(
    orders
      .filter((order) => isCompletedRegularInvoice(order, from, to))
      .reduce((sum, order) => sum + toMoney(order.total), 0),
  );

  const projectPayments = roundMoney(
    orders
      .filter((order) => order.orderType === "PROJECT")
      .flatMap((order) => order.payments ?? [])
      .filter((payment) => payment.status === "COMPLETED")
      .filter((payment) => isWithinPeriod(paymentReceivedAt(payment), from, to))
      .reduce((sum, payment) => sum + toMoney(payment.amount), 0),
  );

  return {
    invoiceTotal,
    projectPayments,
    total: roundMoney(invoiceTotal + projectPayments),
  };
}

/** Completed regular sale invoice totals only. Excludes projects and project payments. */
export function calculateProductRevenue(
  orders: Order[],
  from?: string,
  to?: string,
): number {
  return roundMoney(
    orders
      .filter((order) => isCompletedRegularInvoice(order, from, to))
      .reduce((sum, order) => sum + toMoney(order.total), 0),
  );
}

/** Sum of completed payments received in the period (matches POS / partial payment totals). */
export function calculatePaymentsReceived(
  orders: Order[],
  from?: string,
  to?: string,
): number {
  return roundMoney(
    orders
      .flatMap((order) => order.payments ?? [])
      .filter((payment) => payment.status === "COMPLETED")
      .filter((payment) => isWithinPeriod(paymentReceivedAt(payment), from, to))
      .reduce((sum, payment) => sum + toMoney(payment.amount), 0),
  );
}
