import { randomInt } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { SignJWT } from "jose";
import { app } from "../src/app.js";
import { signToken } from "../src/lib/auth.js";
import { hashPin } from "../src/lib/pin.js";
import { prisma } from "../src/lib/prisma.js";
import type { PermissionKey } from "../src/lib/permissions.js";
import { ensureStoreRoles } from "../src/services/store-roles.js";

export async function createStore(name = "Test Store") {
  const store = await prisma.store.create({
    data: { name, currency: "ILS" },
  });
  await ensureStoreRoles(store.id);
  return store;
}

export async function createUser(
  storeId: string,
  options: {
    role?: UserRole;
    phone?: string;
    pin?: string;
    name?: string;
    permissions?: PermissionKey[];
    isActive?: boolean;
  } = {},
) {
  const role = options.role ?? "CASHIER";
  const storeRole = await prisma.storeRole.findFirst({
    where: { storeId, systemCode: role },
  });
  const pin = options.pin ?? "123456";
  const user = await prisma.user.create({
    data: {
      storeId,
      name: options.name ?? "Test User",
      phone: options.phone ?? `05${randomInt(10000000, 99999999)}`,
      pin: null,
      pinHash: await hashPin(pin),
      role,
      storeRoleId: storeRole?.id,
      isActive: options.isActive ?? true,
      customPolicies: options.permissions,
      tokenVersion: 0,
    },
  });
  return { user, pin };
}

export async function tokenFor(user: {
  id: string;
  storeId: string;
  role: UserRole;
  tokenVersion?: number;
}) {
  return signToken({
    sub: user.id,
    storeId: user.storeId,
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0,
  });
}

export async function legacyToken(user: { id: string; storeId: string; role: UserRole }) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({ storeId: user.storeId, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

export async function api(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  const response = await app.request(path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, data, headers: response.headers };
}

export async function createPricedProduct(
  storeId: string,
  options: { name?: string; onStock?: number; price?: number; barcode?: string } = {},
) {
  return prisma.product.create({
    data: {
      storeId,
      name: options.name ?? "Cola",
      barcode: options.barcode ?? `bc${randomInt(100000, 999999)}`,
      imageUrl: "https://example.com/cola.jpg",
      supplier: "Supplier",
      price: options.price ?? 10,
      cost: 4,
      onStock: options.onStock ?? 10,
      isPriced: true,
    },
  });
}
