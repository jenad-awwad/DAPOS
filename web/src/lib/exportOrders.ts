import { downloadJsonSheet } from "./downloadWorkbook";
import {
  formatDate,
  orderStatusLabel,
  orderTypeLabel,
  paymentLabel,
} from "./format";
import {
  orderPaymentState,
  orderPaymentStateLabel,
  orderTypeOf,
} from "./orderState";
import type { Order } from "./types";

function money(amount: number) {
  return Number(amount.toFixed(2));
}

export function exportOrdersToExcel(orders: Order[], filename: string) {
  const rows = orders.map((order) => ({
    "Order #": order.orderNumber,
    "Project title": order.projectTitle ?? "",
    Date: formatDate(order.completedAt ?? order.createdAt),
    Type: orderTypeLabel(orderTypeOf(order)),
    "Payment status": orderPaymentStateLabel(orderPaymentState(order)),
    Cashier: order.cashier?.name ?? "",
    Method: order.payments?.[0] ? paymentLabel(order.payments[0].method) : "",
    "Order status": orderStatusLabel(order.status),
    Total: money(order.total),
  }));

  downloadJsonSheet(
    rows,
    "Orders",
    filename,
    [16, 28, 22, 14, 16, 18, 16, 14, 12],
  );
}
