export type Currency = "ILS" | "USD" | "JOD";

export type UserRole = "ADMIN" | "MANAGER" | "CASHIER";

export type PermissionKey =
  | "dashboard.view"
  | "pos.sales"
  | "pos.discount"
  | "pos.price"
  | "pos.loyalty"
  | "pos.payments.other"
  | "pos.projects"
  | "calendar.view"
  | "calendar.manage"
  | "orders.view"
  | "orders.projects"
  | "orders.items"
  | "orders.void"
  | "inventory.view"
  | "inventory.manage"
  | "products.view"
  | "products.details"
  | "products.price"
  | "products.manage"
  | "categories.view"
  | "categories.manage"
  | "customers.view"
  | "customers.manage"
  | "stock.view"
  | "stock.adjust"
  | "staff.manage"
  | "roles.manage"
  | "settings.manage"
  | "vendors.view"
  | "vendors.record"
  | "vendors.manage";

export type User = {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  storeId: string;
  permissions?: PermissionKey[];
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

export type Payment = {
  id: string;
  method: PaymentMethod;
  status: string;
  amount: number;
  paidAt?: string | null;
  createdAt?: string;
};

export type OrderProjectMaterial = {
  id: string;
  description: string;
  vendor: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  notes?: string | null;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  orderType?: string;
  projectTitle?: string | null;
  projectSellQuantity?: number | null;
  projectSellUnitPrice?: number | null;
  subtotal: number;
  taxAmount: number;
  discountTotal: number;
  total: number;
  notes?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  cashier?: { id: string; name: string; phone: string };
  customer?: { id: string; name: string; phone?: string | null } | null;
  projectMaterials?: OrderProjectMaterial[];
  payments?: Payment[];
};

export type CalendarEventType =
  | "SCHEDULED_ORDER"
  | "INSTALLATION"
  | "DELIVERY"
  | "MEETING"
  | "ACTIVITY"
  | "OTHER";

export type CalendarEventStatus = "OPEN" | "COMPLETED";

export type CalendarEvent = {
  id: string;
  title: string;
  type: CalendarEventType;
  status: CalendarEventStatus;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  description?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  price?: number | null;
  orderId?: string | null;
  customerId?: string | null;
  payments?: { id: string; method: PaymentMethod; amount: number; paidAt: string }[];
  order?: {
    id: string;
    orderNumber: string;
    orderType?: string;
    projectTitle?: string | null;
    total: number;
    status?: string;
  } | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
};

export type LoginResponse = {
  token: string;
  user: User;
  store: Store;
};
