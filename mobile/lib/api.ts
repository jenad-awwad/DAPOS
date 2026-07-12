import * as SecureStore from "expo-secure-store";

import type { LoginResponse, Order, PaymentMethod, Product } from "./types";



const API_URL =

  process.env.EXPO_PUBLIC_API_URL ??

  "https://dapos-api-production.up.railway.app";



const TOKEN_KEY = "dapos_token";



export async function getToken(): Promise<string | null> {

  return SecureStore.getItemAsync(TOKEN_KEY);

}



export async function setToken(token: string): Promise<void> {

  await SecureStore.setItemAsync(TOKEN_KEY, token);

}



export async function clearToken(): Promise<void> {

  await SecureStore.deleteItemAsync(TOKEN_KEY);

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



  const response = await fetch(`${API_URL}${path}`, {

    ...options,

    headers,

  });



  const data = await response.json().catch(() => ({}));



  if (!response.ok) {

    throw new Error(

      typeof data.error === "string" ? data.error : "Request failed",

    );

  }



  return data as T;

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


