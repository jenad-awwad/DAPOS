import { formatMoney } from "./api";

type InvoicePayment = {
  method: string;
  amount: number;
  status?: string;
};

type InvoiceOrder = {
  orderNumber: string;
  projectTitle?: string | null;
  projectSellQuantity?: number | null;
  projectSellUnitPrice?: number | null;
  discountTotal: number;
  total: number;
  customer?: { name: string; phone?: string | null } | null;
  payments?: InvoicePayment[];
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHEQUE: "Cheque",
  DEBIT: "Debit",
  BREAKAGE: "Breakage",
  DELIVERY: "Delivery order",
};

export function whatsAppPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function whatsAppShareUrl(phone: string | null | undefined, text: string): string {
  const encoded = encodeURIComponent(text);
  const number = whatsAppPhone(phone);
  if (number) return `https://wa.me/${number}?text=${encoded}`;
  return `https://wa.me/?text=${encoded}`;
}

export function customerInvoiceText(
  storeName: string,
  currency: string,
  order: InvoiceOrder,
): string {
  const paid = Math.round(
    (order.payments ?? [])
      .filter((payment) => !payment.status || payment.status === "COMPLETED")
      .reduce((sum, payment) => sum + Number(payment.amount), 0) * 100,
  ) / 100;
  const balance = Math.round(Math.max(order.total - paid, 0) * 100) / 100;
  const lines = [
    storeName,
    `Invoice ${order.orderNumber}`,
    order.projectTitle?.trim() || "",
    order.customer?.name ? `Customer: ${order.customer.name}` : "",
    "",
    `${order.projectSellQuantity ?? 1} × ${formatMoney(order.projectSellUnitPrice ?? 0, currency)}`,
  ];
  if (order.discountTotal > 0) {
    lines.push(`Discount: -${formatMoney(order.discountTotal, currency)}`);
  }
  lines.push(`Customer total: ${formatMoney(order.total, currency)}`);
  const payments = (order.payments ?? []).filter(
    (payment) => !payment.status || payment.status === "COMPLETED",
  );
  if (payments.length > 0) {
    lines.push("", "Payments:");
    for (const payment of payments) {
      lines.push(
        `${PAYMENT_LABELS[payment.method] ?? payment.method}: ${formatMoney(payment.amount, currency)}`,
      );
    }
  }
  lines.push(
    "",
    `Paid: ${formatMoney(paid, currency)}`,
    `Balance due: ${formatMoney(balance, currency)}`,
  );
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}
