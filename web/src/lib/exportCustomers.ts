import { downloadJsonSheet } from "./downloadWorkbook";
import { formatDateOnly } from "./format";
import type { Customer } from "./types";

function money(amount: number) {
  return Number(amount.toFixed(2));
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export function exportCustomersToExcel(customers: Customer[], orderMonthLabel: string) {
  const rows = customers.map((customer) => ({
    Name: customer.name,
    Phone: customer.phone ?? "",
    Email: customer.email ?? "",
    Created: customer.createdAt ? formatDateOnly(customer.createdAt) : "",
    "First order": customer.firstOrderDate ? formatDateOnly(customer.firstOrderDate) : "",
    [`Orders (${orderMonthLabel})`]: customer.ordersThisMonth ?? 0,
    "Total orders": customer.totalOrders ?? 0,
    "Total value": money(customer.totalOrderValue ?? 0),
    Loyalty: customer.loyaltyEnrolled ? "Active" : "",
    Points: customer.loyaltyEnrolled ? customer.loyaltyPoints : "",
    Notes: customer.notes ?? "",
  }));

  downloadJsonSheet(rows, "Customers", `customers-${stamp()}.xlsx`, [
    24, 16, 28, 14, 14, 22, 14, 14, 12, 10, 32,
  ]);
}
