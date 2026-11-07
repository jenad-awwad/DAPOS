import * as XLSX from "xlsx";
import { downloadWorkbook } from "./downloadWorkbook";
import {
  calendarEventTypeLabel,
  formatDate,
  orderStatusLabel,
} from "./format";
import {
  orderPaymentState,
  orderPaymentStateLabel,
} from "./orderState";
import { projectBalanceDue, projectPaidTotal } from "./projectPayments";
import type { Order } from "./types";

function money(amount: number) {
  return Number(amount.toFixed(2));
}

export function projectMaterialCost(order: Order) {
  const lines = order.projectMaterials ?? [];
  if (lines.length === 0) return Number(order.subtotal) || 0;
  return (
    Math.round(lines.reduce((sum, line) => sum + Number(line.lineTotal), 0) * 100) / 100
  );
}

function scheduleOf(order: Order) {
  return [...(order.calendarEvents ?? [])].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  )[0];
}

export function exportProjectDetailsToExcel(orders: Order[], filename: string) {
  const projects = orders.map((order) => {
    const schedule = scheduleOf(order);
    return {
      "Order #": order.orderNumber,
      Date: formatDate(order.completedAt ?? order.createdAt),
      "Project title": order.projectTitle ?? "",
      Customer: order.customer?.name ?? "",
      Phone: order.customer?.phone ?? "",
      Cashier: order.cashier?.name ?? "",
      "Order status": orderStatusLabel(order.status),
      "Payment status": orderPaymentStateLabel(orderPaymentState(order)),
      Schedule: schedule ? formatDate(schedule.startsAt) : "",
      Activity: schedule ? calendarEventTypeLabel(schedule.type) : "",
      Quantity: order.projectSellQuantity ?? "",
      "Unit price": money(Number(order.projectSellUnitPrice ?? 0)),
      Discount: money(Number(order.discountTotal ?? 0)),
      "Customer total": money(Number(order.total)),
      "Material cost": money(projectMaterialCost(order)),
      Paid: money(projectPaidTotal(order)),
      Balance: money(projectBalanceDue(order)),
      Notes: order.notes ?? "",
    };
  });

  const materials = orders.flatMap((order) =>
    (order.projectMaterials ?? []).map((line) => ({
      "Order #": order.orderNumber,
      "Project title": order.projectTitle ?? "",
      Material: line.description,
      Vendor: line.vendor,
      Quantity: line.quantity,
      "Unit cost": money(Number(line.unitCost)),
      "Line cost": money(Number(line.lineTotal)),
      Notes: line.notes ?? "",
    })),
  );

  const history = orders.flatMap((order) =>
    (order.projectAdjustments ?? []).map((entry) => ({
      "Order #": order.orderNumber,
      "Project title": order.projectTitle ?? "",
      When: formatDate(entry.createdAt),
      User: entry.user?.name ?? "",
      Record: entry.note,
    })),
  );

  const workbook = XLSX.utils.book_new();
  const addSheet = (
    rows: Record<string, string | number>[],
    name: string,
    widths: number[],
  ) => {
    const sheet =
      rows.length > 0 ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["No data"]]);
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };

  addSheet(
    projects,
    "Projects",
    [16, 22, 28, 22, 16, 18, 14, 16, 22, 18, 12, 12, 12, 16, 14, 12, 12, 36],
  );
  addSheet(materials, "Materials", [16, 28, 28, 22, 12, 12, 14, 28]);
  addSheet(history, "Record history", [16, 28, 22, 18, 60]);
  downloadWorkbook(workbook, filename);
}
