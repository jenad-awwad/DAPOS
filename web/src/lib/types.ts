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
  storeRoleId?: string | null;
  storeRoleName?: string | null;
  storeId: string;
  permissions?: PermissionKey[];
};

export type StoreRole = {
  id: string;
  name: string;
  isSystem: boolean;
  systemCode: UserRole | null;
  permissions: PermissionKey[];
};

export type StaffUser = User & {
  isActive: boolean;
  customPolicies: PermissionKey[] | null;
  createdAt: string;
  updatedAt: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  loyaltyEnrolled: boolean;
  loyaltyPoints: number;
  loyaltyJoinedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  firstOrderDate?: string | null;
  ordersThisMonth?: number;
  totalOrders?: number;
  totalOrderValue?: number;
};

export type CustomerStatsSummary = {
  customerCount: number;
  totalOrders: number;
  totalOrderValue: number;
  ordersThisMonth: number;
};

export type CustomerReport = {
  customers: Customer[];
  summary: CustomerStatsSummary;
  orderMonthLabel: string;
};

export type CategoryAdmin = Category & {
  isActive?: boolean;
  _count?: { products: number };
};

export type StockMovement = {
  id: string;
  type: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string | null;
  orderId: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string };
  user: { id: string; name: string } | null;
};

export type Store = {
  id: string;
  name: string;
  currency: Currency;
  taxRate: number;
};

export type FullStore = Store & {
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  description?: string | null;
  imageUrl: string;
  supplier: string;
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
  price: number;
  cost?: number | null;
  onStock: number;
  lowStockAt: number | null;
  categoryId: string | null;
  isPriced: boolean;
  isActive?: boolean;
  category?: Category | null;
};

export type CartItem = {
  product: Product;
  quantity: number;
  unitPrice: number;
};

export type OrderType = "REGULAR" | "PROJECT";

export type CalendarEventType =
  | "SCHEDULED_ORDER"
  | "INSTALLATION"
  | "DELIVERY"
  | "MEETING"
  | "ACTIVITY"
  | "OTHER";

export type OrderProjectMaterial = {
  id: string;
  description: string;
  vendor: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  notes?: string | null;
};

export type CalendarEventStatus = "OPEN" | "COMPLETED";

export type OrderProjectAdjustment = {
  id: string;
  note: string;
  createdAt: string;
  user?: { id: string; name: string };
};

export type CalendarEventPayment = {
  id: string;
  method: PaymentMethod;
  amount: number;
  paidAt: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  type: CalendarEventType;
  status: CalendarEventStatus;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  description?: string | null;
  attachmentKey?: string | null;
  attachmentUrl?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  price?: number | null;
  orderId?: string | null;
  customerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  payments?: CalendarEventPayment[];
  order?: {
    id: string;
    orderNumber: string;
    orderType: OrderType;
    projectTitle?: string | null;
    total: number;
    status?: string;
  } | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
};

export type PaymentMethod =
  | "CASH"
  | "CARD"
  | "CHEQUE"
  | "DEBIT"
  | "BREAKAGE"
  | "DELIVERY";

export type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  lineTotal: number;
};

export type Payment = {
  id: string;
  method: PaymentMethod;
  status: string;
  amount: number;
  reference: string | null;
  paidAt: string | null;
  createdAt?: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  orderType?: OrderType;
  projectTitle?: string | null;
  projectSellQuantity?: number | null;
  projectSellUnitPrice?: number | null;
  subtotal: number;
  taxAmount: number;
  discountTotal: number;
  total: number;
  notes?: string | null;
  attachmentKey?: string | null;
  attachmentUrl?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  items?: OrderItem[];
  projectMaterials?: OrderProjectMaterial[];
  projectAdjustments?: OrderProjectAdjustment[];
  payments?: Payment[];
  cashier?: { id: string; name: string; phone: string };
  customer?: { id: string; name: string; phone?: string | null } | null;
};

export type LoginResponse = {
  token: string;
  user: User;
  store: Store;
};

export type ItemSalesLine = {
  id: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  sku: string | null;
  barcode: string;
  categoryName: string | null;
  quantity: number;
  unitPrice: number;
  cost: number | null;
  lineTotal: number;
  soldAt: string;
};

export type ItemSalesReport = {
  items: ItemSalesLine[];
  summary: {
    quantitySold: number;
    totalRevenue: number;
    /** Null when the current user is not allowed to see product costs. */
    totalCost: number | null;
  };
};
