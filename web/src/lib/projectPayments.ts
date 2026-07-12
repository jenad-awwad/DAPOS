import type { Order } from "./types";

export function projectPaidTotal(order: Pick<Order, "payments">): number {
  return Math.round(
    (order.payments ?? [])
      .filter((payment) => payment.status === "COMPLETED")
      .reduce((sum, payment) => sum + payment.amount, 0) * 100,
  ) / 100;
}

export function projectBalanceDue(order: Pick<Order, "total" | "payments">): number {
  return Math.round(Math.max(order.total - projectPaidTotal(order), 0) * 100) / 100;
}

export function projectIsFullyPaid(order: Pick<Order, "total" | "payments">): boolean {
  return projectBalanceDue(order) <= 0;
}
