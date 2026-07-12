export type Currency = "ILS" | "USD" | "JOD";

export type UserRole = "ADMIN" | "MANAGER" | "CASHIER";

export type User = {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  storeId: string;
};

export type Store = {
  id: string;
  name: string;
  currency: Currency;
  taxRate: number;
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type Product = {
  id: string;
  sku: string | null;
  barcode: string;
  name: string;
  imageUrl: string;
  supplier: string;
  price: number;
  cost?: number | null;
  onStock: number;
  lowStockAt: number | null;
  categoryId: string | null;
  isPriced: boolean;
  category?: Category | null;
};

export type CartItem = {
  product: Product;
  quantity: number;
};

export type PaymentMethod =
  | "CASH"
  | "CARD"
  | "CHEQUE"
  | "DEBIT"
  | "BREAKAGE"
  | "DELIVERY";

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  discountTotal: number;
  total: number;
  completedAt?: string | null;
};

export type LoginResponse = {
  token: string;
  user: User;
  store: Store;
};
