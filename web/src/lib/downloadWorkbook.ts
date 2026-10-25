import * as XLSX from "xlsx";

export function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const bytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer | number[] | Uint8Array;

  // Copy into a fresh Uint8Array so the backing buffer is a plain ArrayBuffer
  // (not SharedArrayBuffer), which is what Blob accepts under strict DOM typings.
  const binary: Uint8Array<ArrayBuffer> =
    bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);

  const blob = new Blob([binary], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJsonSheet(
  rows: Record<string, string | number>[],
  sheetName: string,
  filename: string,
  colWidths?: number[],
) {
  const worksheet =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([["No data"]]);

  if (colWidths?.length) {
    worksheet["!cols"] = colWidths.map((wch) => ({ wch }));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  downloadWorkbook(workbook, filename);
}
