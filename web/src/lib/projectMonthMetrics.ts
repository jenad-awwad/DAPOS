import { toMoney } from "./format";
import { projectBalanceDue } from "./projectPayments";
import type { CalendarEvent, Order } from "./types";

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

export function buildProjectScheduleMap(
  calendarEvents: CalendarEvent[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const event of calendarEvents) {
    if (!event.orderId) continue;
    const existing = map.get(event.orderId);
    if (!existing || new Date(event.startsAt).getTime() < new Date(existing).getTime()) {
      map.set(event.orderId, event.startsAt);
    }
  }

  return map;
}

export function getProjectScheduleDate(
  order: Order,
  scheduleByOrderId: Map<string, string>,
): string | null {
  return scheduleByOrderId.get(order.id) ?? null;
}

export type ProjectPeriodMetrics = {
  scheduledProjects: number;
  openProjects: number;
  closedProjects: number;
  totalPayments: number;
  totalDue: number;
  totalScheduledValue: number;
};

export function calculateProjectPeriodMetrics(
  projects: Order[],
  scheduleByOrderId: Map<string, string>,
  from?: string,
  to?: string,
): ProjectPeriodMetrics {
  const scheduledInPeriod = projects.filter((project) => {
    const scheduleDate = getProjectScheduleDate(project, scheduleByOrderId);
    return isWithinPeriod(scheduleDate, from, to);
  });

  const openProjects = scheduledInPeriod.filter((project) => project.status === "OPEN");
  const closedProjects = scheduledInPeriod.filter(
    (project) => project.status === "COMPLETED",
  );

  const totalPayments = roundMoney(
    scheduledInPeriod
      .flatMap((project) => project.payments ?? [])
      .filter((payment) => payment.status === "COMPLETED")
      .reduce((sum, payment) => sum + toMoney(payment.amount), 0),
  );

  const totalDue = roundMoney(
    openProjects.reduce((sum, project) => sum + projectBalanceDue(project), 0),
  );

  const totalScheduledValue = roundMoney(
    scheduledInPeriod.reduce((sum, project) => sum + toMoney(project.total), 0),
  );

  return {
    scheduledProjects: scheduledInPeriod.length,
    openProjects: openProjects.length,
    closedProjects: closedProjects.length,
    totalPayments,
    totalDue,
    totalScheduledValue,
  };
}

export type MonthlyProjectRow = {
  monthKey: string;
  label: string;
  from: string;
  to: string;
  scheduledProjects: number;
  openProjects: number;
  closedProjects: number;
  totalPayments: number;
  totalDue: number;
};

function monthRange(year: number, monthIndex: number): { from: string; to: string } {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function monthLabel(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
}

/** Last N calendar months including the current month, oldest first. */
export function calculateMonthlyProjectBreakdown(
  projects: Order[],
  scheduleByOrderId: Map<string, string>,
  months = 6,
): MonthlyProjectRow[] {
  const now = new Date();
  const rows: MonthlyProjectRow[] = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const { from, to } = monthRange(date.getFullYear(), date.getMonth());
    const metrics = calculateProjectPeriodMetrics(
      projects,
      scheduleByOrderId,
      from,
      to,
    );

    rows.push({
      monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: monthLabel(date.getFullYear(), date.getMonth()),
      from,
      to,
      scheduledProjects: metrics.scheduledProjects,
      openProjects: metrics.openProjects,
      closedProjects: metrics.closedProjects,
      totalPayments: metrics.totalPayments,
      totalDue: metrics.totalDue,
    });
  }

  return rows;
}
