import * as XLSX from "xlsx";
import { formatDateOnly } from "./format";
import type { ItemSalesLine } from "./types";

function formatExportMoney(amount: number) {
  return Number(amount.toFixed(2));
}

export function exportItemSalesToExcel(
  items: ItemSalesLine[],
  filename = "items-sales-report.xlsx",
) {
  const rows = items.map((row) => {
    const sold = new Date(row.soldAt);
    const time = sold.toLocaleTimeString();

    return {
      Date: formatDateOnly(row.soldAt),
      Time: time,
      "Order #": row.orderNumber,
      "Item name": row.productName,
      SKU: row.sku ?? "",
      Barcode: row.barcode,
      Category: row.categoryName ?? "",
      Quantity: row.quantity,
      "Selling price": formatExportMoney(row.unitPrice),
      "Cost per item": row.cost != null ? formatExportMoney(row.cost) : "",
      "Line total": formatExportMoney(row.lineTotal),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 28 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Items sales");

  XLSX.writeFile(workbook, filename);
}
