import { formatDateOnly } from "./format";
import { downloadJsonSheet } from "./downloadWorkbook";
import type {
  VendorBalanceRow,
  VendorInvoiceRow,
  VendorPaymentRow,
} from "./api";

function money(amount: number) {
  return Number(amount.toFixed(2));
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export function exportVendorInvoicesToExcel(
  invoices: VendorInvoiceRow[],
  includeTotals: boolean,
) {
  const rows = invoices.map((row) => ({
    Date: formatDateOnly(row.invoiceDate),
    Vendor: row.vendor.name,
    "Invoice #": row.invoiceNumber,
    Source: row.source === "PROJECT" ? "Project" : "Manual",
    ...(includeTotals ? { Total: money(row.total) } : {}),
    Attachment: row.attachmentUrl ?? "",
  }));

  downloadJsonSheet(
    rows,
    "Invoices",
    `vendor-invoices-${stamp()}.xlsx`,
    [14, 24, 18, 12, 12, 40],
  );
}

export function exportVendorPaymentsToExcel(
  payments: VendorPaymentRow[],
  includeBalances: boolean,
) {
  const rows = payments.map((row) => ({
    Date: formatDateOnly(row.paidAt),
    Vendor: row.vendor.name,
    Amount: money(row.amount),
    ...(includeBalances ? { "Remaining balance": money(row.remainingBalance) } : {}),
    Attachment: row.attachmentUrl ?? "",
  }));

  downloadJsonSheet(
    rows,
    "Payments",
    `vendor-payments-${stamp()}.xlsx`,
    [14, 24, 12, 18, 40],
  );
}

export function exportVendorBalancesToExcel(balances: VendorBalanceRow[]) {
  const rows = balances.map((row) => ({
    Vendor: row.name,
    "Starting balance": money(row.startingBalance),
    Invoices: money(row.invoiceTotal),
    Payments: money(row.paymentTotal),
    "Current balance": money(row.currentBalance),
  }));

  downloadJsonSheet(
    rows,
    "Balances",
    `vendor-balances-${stamp()}.xlsx`,
    [24, 18, 14, 14, 18],
  );
}
