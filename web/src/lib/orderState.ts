import type { Order } from "./types";

export type OrderPaymentState = "OPEN" | "CLOSED";

export function orderTypeOf(order: Order): "REGULAR" | "PROJECT" {
  return order.orderType === "PROJECT" ? "PROJECT" : "REGULAR";
}

export function orderPaymentState(order: Order): OrderPaymentState {
  if (order.status === "OPEN") {
    return "OPEN";
  }

  if (
    orderTypeOf(order) === "REGULAR" &&
    (order.payments ?? []).some((payment) => payment.method === "DEBIT")
  ) {
    return "OPEN";
  }

  return "CLOSED";
}

export function orderPaymentStateLabel(state: OrderPaymentState): string {
  return state === "OPEN" ? "Open" : "Closed";
}

export function orderPaymentStateColor(state: OrderPaymentState): string {
  return state === "OPEN" ? "blue" : "gray";
}
