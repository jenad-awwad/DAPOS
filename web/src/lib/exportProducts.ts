import { downloadJsonSheet } from "./downloadWorkbook";
import { formatDate } from "./format";
import type { Product } from "./types";

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function money(amount: number) {
  return Number(amount.toFixed(2));
}

export function productStatusLabel(product: Product) {
  if (product.isActive === false) return "Inactive";
  return product.isPriced ? "Published" : "Pending pricing";
}

export function stockAtPrice(product: Product) {
  return product.onStock * Number(product.price || 0);
}

export function stockAtCost(product: Product) {
  if (product.cost == null) return null;
  return product.onStock * Number(product.cost);
}

export function exportProductsToExcel(products: Product[]) {
  const rows = products.map((product) => ({
    Name: product.name,
    Barcode: product.barcode,
    SKU: product.sku ?? "",
    Supplier: product.vendor?.name ?? product.supplier ?? "",
    Price: product.isPriced ? money(Number(product.price)) : "",
    Stock: product.onStock,
    Status: productStatusLabel(product),
  }));

  downloadJsonSheet(rows, "Products", `products-${stamp()}.xlsx`, [
    28, 18, 14, 24, 12, 10, 18,
  ]);
}

export function exportProductDetailsToExcel(products: Product[], includeCost: boolean) {
  const units = products.reduce((sum, product) => sum + product.onStock, 0);
  const priceValue = products.reduce((sum, product) => sum + stockAtPrice(product), 0);
  const costValue = products.reduce((sum, product) => sum + (stockAtCost(product) ?? 0), 0);

  const rows = products.map((product) => {
    const cost = stockAtCost(product);
    return {
      Name: product.name,
      Barcode: product.barcode,
      SKU: product.sku ?? "",
      Vendor: product.vendor?.name ?? product.supplier ?? "",
      ...(includeCost ? { Cost: product.cost == null ? "" : money(Number(product.cost)) } : {}),
      Price: product.isPriced ? money(Number(product.price)) : "",
      Stock: product.onStock,
      "Stock at selling price": money(stockAtPrice(product)),
      ...(includeCost ? { "Stock at cost": cost == null ? "" : money(cost) } : {}),
      Created: product.createdAt ? formatDate(product.createdAt) : "",
      Status: productStatusLabel(product),
    };
  });

  rows.push({
    Name: "Total",
    Barcode: "",
    SKU: "",
    Vendor: "",
    ...(includeCost ? { Cost: "" } : {}),
    Price: "",
    Stock: units,
    "Stock at selling price": money(priceValue),
    ...(includeCost ? { "Stock at cost": money(costValue) } : {}),
    Created: "",
    Status: `${products.length} products`,
  });

  downloadJsonSheet(rows, "Stock details", `product-details-${stamp()}.xlsx`, [
    28, 18, 14, 24, 12, 12, 10, 22, 16, 22, 18,
  ]);
}
