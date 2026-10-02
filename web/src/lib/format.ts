import type { Currency, UserRole } from "./types";

export function formatMoney(amount: number | string, currency: Currency | string) {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(2)}`;
  }
}

export function toMoney(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDateOnly(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

export function formatTimeOnly(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: "short",
  }).format(new Date(value));
}

export function paymentLabel(method: string) {
  const labels: Record<string, string> = {
    CASH: "Cash",
    CARD: "Card",
    CHEQUE: "Cheque",
    DEBIT: "Debit",
    BREAKAGE: "Breakage",
    DELIVERY: "Delivery order",
  };
  return labels[method] ?? method;
}

export function calendarEventTypeLabel(type: string) {
  const labels: Record<string, string> = {
    SCHEDULED_ORDER: "Scheduled order",
    INSTALLATION: "Installation",
    DELIVERY: "Delivery",
    MEETING: "Meeting",
    ACTIVITY: "Activity",
    OTHER: "Other",
  };
  return labels[type] ?? type;
}

export function orderTypeLabel(type: string) {
  return type === "PROJECT" ? "Project" : "Regular sale";
}

export function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    OPEN: "Open",
    COMPLETED: "Completed",
    VOIDED: "Voided",
    DRAFT: "Draft",
    REFUNDED: "Refunded",
  };
  return labels[status] ?? status;
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    ADMIN: "Administrator",
    MANAGER: "Manager",
    CASHIER: "Cashier",
  };
  return labels[role] ?? role;
}

export function storeRoleLabel(role: {
  name: string;
  systemCode?: UserRole | null;
}) {
  return role.name || (role.systemCode ? roleLabel(role.systemCode) : "Role");
}
