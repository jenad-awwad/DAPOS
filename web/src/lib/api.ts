import type {
  CalendarEvent,
  CalendarEventType,
  CategoryAdmin,
  Currency,
  Customer,
  CustomerReport,
  FullStore,
  ItemSalesReport,
  LoginResponse,
  Order,
  PaymentMethod,
  PermissionKey,
  Product,
  StaffUser,
  StoreRole,
  StockMovement,
  Store,
  User,
  UserRole,
} from "./types";
import type { PermissionDefinition, RolePoliciesMap } from "./permissions";

const API_URL =
  import.meta.env.VITE_API_URL ??
  "https://dapos-api-production.up.railway.app";

const TOKEN_KEY = "dapos_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      `Cannot reach API at ${API_URL}. Make sure the backend is running (npm run dev in backend/).`,
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : "Request failed";
    if (response.status === 404 && message === "Not found") {
      throw new Error(
        `API route not found (${API_URL}${path}). If running locally, restart the web app and use http://localhost:5173. Production may need a backend redeploy.`,
      );
    }
    const details = data.details as
      | { fieldErrors?: Record<string, string[]> }
      | undefined;
    const fieldMessages = details?.fieldErrors
      ? Object.entries(details.fieldErrors)
          .flatMap(([field, errors]) =>
            (errors ?? []).map((error) => `${field}: ${error}`),
          )
          .join("; ")
      : "";
    throw new Error(fieldMessages ? `${message} (${fieldMessages})` : message);
  }

  return data as T;
}

export function login(phone: string, pin: string) {
  return request<LoginResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ phone, pin }) },
    false,
  );
}

export function fetchMe() {
  return request<{ user: User; store: Store }>("/auth/me");
}

export function fetchStore() {
  return request<{ store: FullStore; currencies: string[] }>("/store");
}

export function updateStore(payload: {
  name?: string;
  address?: string | null;
  phone?: string | null;
  currency?: Currency;
  taxRate?: number;
}) {
  return request<{ store: FullStore; currencies: string[] }>("/store", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchCategories() {
  return request<{ categories: { id: string; name: string; sortOrder: number }[] }>(
    "/categories",
  );
}

export function fetchAllCategories() {
  return request<{ categories: CategoryAdmin[] }>("/categories/all");
}

export function createCategory(payload: { name: string; sortOrder?: number }) {
  return request<{ category: CategoryAdmin }>("/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCategory(
  id: string,
  payload: { name?: string; sortOrder?: number; isActive?: boolean },
) {
  return request<{ category: CategoryAdmin }>(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteCategory(id: string) {
  return request<{ category: CategoryAdmin }>(`/categories/${id}`, {
    method: "DELETE",
  });
}

export function fetchProducts(params?: {
  search?: string;
  name?: string;
  barcode?: string;
  categoryId?: string;
  lowStock?: boolean;
  includeInactive?: boolean;
  pricedOnly?: boolean;
  needsPricing?: boolean;
  status?: "ACTIVE" | "INACTIVE" | "NEEDS_PRICING" | "PRICED";
  dateFrom?: string;
  dateTo?: string;
}) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.name) query.set("name", params.name);
  if (params?.barcode) query.set("barcode", params.barcode);
  if (params?.categoryId) query.set("categoryId", params.categoryId);
  if (params?.lowStock) query.set("lowStock", "true");
  if (params?.includeInactive) query.set("includeInactive", "true");
  if (params?.pricedOnly) query.set("pricedOnly", "true");
  if (params?.needsPricing) query.set("needsPricing", "true");
  if (params?.status) query.set("status", params.status);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  const qs = query.toString();
  return request<{ products: Product[] }>(`/products${qs ? `?${qs}` : ""}`);
}

export function fetchProduct(id: string) {
  return request<{ product: Product }>(`/products/${id}`);
}

export function fetchProductByBarcode(barcode: string) {
  return request<{ product: Product }>(
    `/products/barcode/${encodeURIComponent(barcode)}`,
  );
}

export function createProduct(payload: {
  sku?: string | null;
  barcode?: string | null;
  name: string;
  supplier?: string;
  vendorId?: string | null;
  imageUrl: string;
  onStock?: number;
  lowStockAt?: number | null;
  categoryId?: string | null;
  description?: string | null;
}) {
  return request<{ product: Product }>("/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function setProductPricing(
  id: string,
  payload: { price: number; cost: number },
) {
  return request<{ product: Product }>(`/products/${id}/pricing`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type PricingRequest = {
  id: string;
  status: "PENDING" | "COMPLETED";
  submittedAt: string;
  completedAt: string | null;
  product: Product;
  requestedBy: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
  completedBy: { id: string; name: string } | null;
};

export function fetchPricingRequests() {
  return request<{
    requests: PricingRequest[];
    assignees: { id: string; name: string }[];
  }>("/products/pricing-requests");
}

export function assignPricingRequest(id: string, assignedToId: string | null) {
  return request<{ request: PricingRequest }>(`/products/pricing-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ assignedToId }),
  });
}

export function updateProduct(id: string, payload: Partial<Product>) {
  return request<{ product: Product }>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(id: string) {
  return request<{ product: Product }>(`/products/${id}`, {
    method: "DELETE",
  });
}

export function fetchCustomers(search?: string, loyaltyOnly?: boolean) {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (loyaltyOnly) query.set("loyalty", "true");
  const qs = query.toString();
  return request<{ customers: Customer[] }>(`/customers${qs ? `?${qs}` : ""}`);
}

export function fetchCustomerReport(params?: {
  search?: string;
  loyaltyOnly?: boolean;
  nonLoyaltyOnly?: boolean;
  createdFrom?: string;
  createdTo?: string;
  orderMonth?: string;
}) {
  const query = new URLSearchParams();
  query.set("stats", "true");
  if (params?.search) query.set("search", params.search);
  if (params?.loyaltyOnly) query.set("loyalty", "true");
  if (params?.nonLoyaltyOnly) query.set("loyalty", "false");
  if (params?.createdFrom) query.set("createdFrom", params.createdFrom);
  if (params?.createdTo) query.set("createdTo", params.createdTo);
  if (params?.orderMonth) query.set("orderMonth", params.orderMonth);
  const qs = query.toString();
  return request<CustomerReport>(`/customers?${qs}`);
}

export function enrollLoyaltyCustomer(payload: {
  name: string;
  phone: string;
  email?: string | null;
  customerId?: string;
}) {
  return request<{ customer: Customer }>("/customers/enroll", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function upsertPosCustomer(payload: { name: string; phone: string }) {
  return request<{ customer: Customer }>("/customers/pos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createCustomer(payload: {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}) {
  return request<{ customer: Customer }>("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCustomer(
  id: string,
  payload: Partial<Customer>,
) {
  return request<{ customer: Customer }>(`/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteCustomer(id: string) {
  return request<{ ok: boolean }>(`/customers/${id}`, { method: "DELETE" });
}

export function fetchStaff() {
  return request<{ users: StaffUser[] }>("/users");
}

export function fetchCashiers() {
  return request<{ users: { id: string; name: string }[] }>("/users/cashiers");
}

export function createStaff(payload: {
  name: string;
  phone: string;
  pin: string;
  role?: UserRole;
  storeRoleId?: string;
}) {
  return request<{ user: StaffUser }>("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStaff(
  id: string,
  payload: Partial<{
    name: string;
    phone: string;
    pin: string;
    role: UserRole;
    storeRoleId: string | null;
    isActive: boolean;
    customPolicies: PermissionKey[] | null;
  }>,
) {
  return request<{ user: StaffUser }>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchAccessCatalog() {
  return request<{ permissions: PermissionDefinition[] }>("/access/catalog");
}

export function fetchRolePolicies() {
  return request<{
    roles: StoreRole[];
    policies: RolePoliciesMap;
    defaults: RolePoliciesMap;
  }>("/access/role-policies");
}

export function fetchStoreRoles() {
  return request<{ roles: StoreRole[] }>("/access/roles");
}

export function createStoreRole(payload: {
  name: string;
  permissions: PermissionKey[];
}) {
  return request<{ role: StoreRole }>("/access/roles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStoreRole(
  id: string,
  payload: Partial<{ name: string; permissions: PermissionKey[] }>,
) {
  return request<{ role: StoreRole }>(`/access/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteStoreRole(id: string) {
  return request<{ ok: boolean }>(`/access/roles/${id}`, {
    method: "DELETE",
  });
}

export function updateRolePolicies(policies: RolePoliciesMap) {
  return request<{ roles: StoreRole[]; policies: RolePoliciesMap }>(
    "/access/role-policies",
    {
      method: "PATCH",
      body: JSON.stringify(policies),
    },
  );
}

export function fetchStockMovements(params?: {
  productId?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.productId) query.set("productId", params.productId);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request<{ movements: StockMovement[] }>(
    `/stock-movements${qs ? `?${qs}` : ""}`,
  );
}

export function adjustStock(payload: {
  productId: string;
  quantity: number;
  type: "RESTOCK" | "ADJUSTMENT";
  reason?: string;
}) {
  return request<{ movement: StockMovement }>("/stock-movements/adjust", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchOrders(params?: {
  limit?: number;
  orderNumber?: string;
  status?: string;
  orderType?: "REGULAR" | "PROJECT";
  paymentOpen?: boolean;
  cashierId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.orderNumber) query.set("orderNumber", params.orderNumber);
  if (params?.status) query.set("status", params.status);
  if (params?.orderType) query.set("orderType", params.orderType);
  if (params?.paymentOpen !== undefined) {
    query.set("paymentOpen", String(params.paymentOpen));
  }
  if (params?.cashierId) query.set("cashierId", params.cashierId);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  const qs = query.toString();
  return request<{ orders: Order[] }>(`/orders${qs ? `?${qs}` : ""}`);
}

export function fetchItemSalesReport(params?: {
  search?: string;
  cashierId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.cashierId) query.set("cashierId", params.cashierId);
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  const qs = query.toString();
  return request<ItemSalesReport>(`/orders/reports/item-sales${qs ? `?${qs}` : ""}`);
}

export function fetchOrder(id: string) {
  return request<{ order: Order }>(`/orders/${id}`);
}

export function createOrder(payload: {
  items: {
    productId: string;
    quantity: number;
    unitPrice?: number;
    discount?: number;
  }[];
  paymentMethod: PaymentMethod;
  customerId?: string;
  notes?: string;
  discountTotal?: number;
}) {
  return request<{ order: Order }>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createProjectOrder(payload: {
  projectTitle: string;
  sellQuantity: number;
  sellUnitPrice: number;
  materials?: {
    description: string;
    vendor: string;
    quantity: number;
    unitCost: number;
    notes?: string;
  }[];
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  attachmentKey?: string | null;
  discountTotal?: number;
  scheduleAt?: string;
  scheduleType?: CalendarEventType;
}) {
  return request<{ order: Order }>("/orders/project", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProjectOrder(
  id: string,
  payload: Partial<{
    projectTitle: string;
    sellQuantity: number;
    sellUnitPrice: number;
    materials: {
      description: string;
      vendor: string;
      quantity: number;
      unitCost: number;
      notes?: string;
    }[];
    customerId: string;
    customerName: string;
    customerPhone: string;
    notes: string;
    attachmentKey: string | null;
    discountTotal: number;
    scheduleAt: string;
    scheduleType: CalendarEventType;
  }>,
) {
  return request<{ order: Order }>(`/orders/${id}/project`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function submitProjectOrder(id: string) {
  return request<{ order: Order }>(`/orders/${id}/project/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function recordProjectPayment(
  id: string,
  payload: { amount: number; paymentMethod: PaymentMethod },
) {
  return request<{ order: Order }>(`/orders/${id}/project/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function voidOrder(id: string) {
  return request<{ order: Order }>(`/orders/${id}/void`, { method: "POST" });
}

export function fetchCalendarEvents(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString();
  return request<{ events: CalendarEvent[] }>(`/calendar${qs ? `?${qs}` : ""}`);
}

export function fetchCalendarEvent(id: string) {
  return request<{ event: CalendarEvent }>(`/calendar/${id}`);
}

export function createCalendarEvent(payload: {
  title: string;
  type?: CalendarEventType;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  description?: string;
  price?: number;
  orderId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone: string;
  attachmentKey?: string | null;
}) {
  return request<{ event: CalendarEvent }>("/calendar", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCalendarEvent(
  id: string,
  payload: Partial<{
    title: string;
    type: CalendarEventType;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    description: string;
    price: number;
    orderId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    attachmentKey: string | null;
  }>,
) {
  return request<{ event: CalendarEvent }>(`/calendar/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function recordCalendarEventPayment(
  id: string,
  payload: { amount: number; paymentMethod: PaymentMethod },
) {
  return request<{ event: CalendarEvent }>(`/calendar/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function completeCalendarEvent(id: string) {
  return request<{ event: CalendarEvent }>(`/calendar/${id}/complete`, {
    method: "POST",
  });
}

export function deleteCalendarEvent(id: string) {
  return request<{ ok: boolean }>(`/calendar/${id}`, { method: "DELETE" });
}

export type VendorOption = { id: string; name: string };

export type VendorInvoiceRow = {
  id: string;
  vendorId: string;
  invoiceDate: string;
  invoiceNumber: string;
  invoiceNumberAuto: boolean;
  total: number;
  attachmentKey: string | null;
  attachmentUrl: string | null;
  source: "MANUAL" | "PROJECT";
  description: string | null;
  vendor: VendorOption;
};

export type VendorPaymentRow = {
  id: string;
  vendorId: string;
  paidAt: string;
  amount: number;
  remainingBalance: number;
  attachmentKey: string | null;
  attachmentUrl: string | null;
  vendor: VendorOption;
};

export type VendorBalanceRow = {
  vendorId: string;
  name: string;
  startingBalance: number;
  invoiceTotal: number;
  paymentTotal: number;
  currentBalance: number;
};

export function fetchVendorOptions() {
  return request<{ vendors: VendorOption[] }>("/vendors/options");
}

export function fetchVendorInvoices() {
  return request<{ invoices: VendorInvoiceRow[] }>("/vendors/invoices");
}

export function fetchVendorPayments() {
  return request<{ payments: VendorPaymentRow[] }>("/vendors/payments");
}

export function fetchVendorBalances() {
  return request<{ balances: VendorBalanceRow[] }>("/vendors/balances");
}

export function createVendor(payload: {
  name: string;
  startingBalance?: number;
}) {
  return request<{ vendor: VendorOption & { startingBalance: number } }>(
    "/vendors",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function createVendorInvoice(payload: {
  vendorId?: string;
  vendorName?: string;
  invoiceDate: string;
  invoiceNumber?: string;
  invoiceNumberAuto?: boolean;
  total: number;
  attachmentKey?: string | null;
}) {
  return request<{ invoice: VendorInvoiceRow }>("/vendors/invoices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createVendorPayment(payload: {
  vendorId?: string;
  vendorName?: string;
  paidAt: string;
  amount: number;
  attachmentKey?: string | null;
}) {
  return request<{ payment: VendorPaymentRow }>("/vendors/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function uploadVendorAttachment(imageDataUrl: string) {
  return uploadAttachment(imageDataUrl);
}

export function uploadAttachment(imageDataUrl: string) {
  return request<{ key: string }>("/uploads/attachment", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl }),
  });
}
