import type { CalendarEvent } from "./types";

export function activityPaidTotal(event: Pick<CalendarEvent, "payments">): number {
  return Math.round(
    (event.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0) * 100,
  ) / 100;
}

export function activityPrice(event: Pick<CalendarEvent, "price">): number {
  return event.price ?? 0;
}

export function activityBalanceDue(
  event: Pick<CalendarEvent, "price" | "payments">,
): number {
  return Math.round(Math.max(activityPrice(event) - activityPaidTotal(event), 0) * 100) / 100;
}

export function activityIsFullyPaid(
  event: Pick<CalendarEvent, "price" | "payments">,
): boolean {
  const price = activityPrice(event);
  if (price <= 0) return true;
  return activityBalanceDue(event) <= 0;
}

export function activityRequiresPayment(
  event: Pick<CalendarEvent, "price">,
): boolean {
  return activityPrice(event) > 0;
}
