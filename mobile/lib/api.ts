import type {
  CalendarEvent,
  CalendarEventType,
  LoginResponse,
  Order,
  PaymentMethod,
  Product,
} from "./types";
import { API_URL } from "./api-url";
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "./token-storage";

export async function getToken(): Promise<string | null> {
  return getStoredToken();
}

export async function setToken(token: string): Promise<void> {
  await setStoredToken(token);
}

export async function clearToken(): Promise<void> {
  await clearStoredToken();
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedListener | null) {
  onUnauthorized = handler;
}

export function notifyUnauthorized() {
  onUnauthorized?.();
}



async function request<T>(

  path: string,

  options: RequestInit = {},

  auth = true,

): Promise<T> {

  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");



  if (auth) {

    const token = await getToken();

    if (token) {

      headers.set("Authorization", `Bearer ${token}`);

    }

  }



  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && !path.startsWith("/auth/login")) {
        await clearToken();
        notifyUnauthorized();
      }
      throw new ApiError(
        typeof data.error === "string" ? data.error : "Request failed",
        response.status,
      );
    }

    return data as T;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        `Cannot reach API at ${API_URL}. Start the backend (npm run dev in backend/).`,
      );
    }
    throw err;
  }

}



export function login(phone: string, pin: string) {

  return request<LoginResponse>(

    "/auth/login",

    {

      method: "POST",

      body: JSON.stringify({ phone, pin }),

    },

    false,

  );

}



export function fetchProducts(params?: {

  search?: string;

  categoryId?: string;

  pricedOnly?: boolean;

}) {

  const query = new URLSearchParams();

  if (params?.search) query.set("search", params.search);

  if (params?.categoryId) query.set("categoryId", params.categoryId);

  if (params?.pricedOnly) query.set("pricedOnly", "true");

  const qs = query.toString();

  return request<{ products: Product[] }>(`/products${qs ? `?${qs}` : ""}`);

}



export function fetchProductByBarcode(barcode: string) {

  return request<{ product: Product }>(`/products/barcode/${barcode}`);

}



export function fetchCategories() {

  return request<{ categories: { id: string; name: string }[] }>(

    "/categories",

  );

}



export function createProduct(payload: {

  sku?: string | null;

  barcode?: string | null;

  name: string;

  supplier: string;

  imageUrl: string;

  onStock?: number;

  categoryId?: string | null;

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



export function createOrder(

  items: { productId: string; quantity: number }[],

  paymentMethod: PaymentMethod,

) {

  return request<{ order: Order }>("/orders", {

    method: "POST",

    body: JSON.stringify({ items, paymentMethod }),

  });

}



export function fetchOrders(params?: {
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return request<{ orders: Order[] }>(`/orders${qs ? `?${qs}` : ""}`);
}

export function fetchOrder(id: string) {
  return request<{ order: Order }>(`/orders/${id}`);
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
  }[];
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  discountTotal?: number;
  scheduleAt?: string;
  scheduleType?: CalendarEventType;
}) {
  return request<{ order: Order }>("/orders/project", {
    method: "POST",
    body: JSON.stringify(payload),
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

export function submitProjectOrder(id: string) {
  return request<{ order: Order }>(`/orders/${id}/project/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function fetchCalendarEvents(params?: { from?: string; to?: string }) {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString();
  return request<{ events: CalendarEvent[] }>(`/calendar${qs ? `?${qs}` : ""}`);
}

export function createCalendarEvent(payload: {
  title: string;
  type?: CalendarEventType;
  startsAt: string;
  description?: string;
  customerName?: string;
  customerPhone: string;
  price?: number;
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
    description: string;
    customerName: string;
    customerPhone: string;
    price: number;
  }>,
) {
  return request<{ event: CalendarEvent }>(`/calendar/${id}`, {
    method: "PATCH",
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

export function fetchItemSalesReport(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  const query = new URLSearchParams();
  if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params?.dateTo) query.set("dateTo", params.dateTo);
  const qs = query.toString();
  return request<{
    summary: {
      quantitySold: number;
      totalRevenue: number;
      /** Null when the current user is not allowed to see product costs. */
      totalCost: number | null;
    };
  }>(`/orders/reports/item-sales${qs ? `?${qs}` : ""}`);
}

export type VendorOption = { id: string; name: string };

export type VendorInvoiceRow = {
  id: string;
  invoiceDate: string;
  invoiceNumber: string;
  total: number;
  attachmentUrl: string | null;
  source: "MANUAL" | "PROJECT";
  vendor: VendorOption;
};

export type VendorPaymentRow = {
  id: string;
  paidAt: string;
  amount: number;
  remainingBalance: number;
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
  return request<{ key: string }>("/uploads/vendor-attachment", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl }),
  });
}

export function formatMoney(amount: number, currency: string) {

  const code = currency === "JOD" ? "JOD" : currency;

  try {

    return new Intl.NumberFormat(undefined, {

      style: "currency",

      currency: code,

      minimumFractionDigits: 2,

    }).format(amount);

  } catch {

    return `${currency} ${amount.toFixed(2)}`;

  }

}


