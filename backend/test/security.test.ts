import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  api,
  createPricedProduct,
  createStore,
  createUser,
  legacyToken,
  tokenFor,
} from "./helpers.js";

const ROUTE_PERMISSIONS: Record<string, string> = {
  "POST /auth/login": "public",
  "POST /auth/logout": "auth",
  "GET /auth/me": "auth",
  "GET /health": "public",
  "GET /store": "auth",
  "PATCH /store": "settings.manage",
  "GET /categories": "auth",
  "GET /categories/all": "categories.view|categories.manage",
  "POST /categories": "categories.manage",
  "PATCH /categories/:id": "categories.manage",
  "DELETE /categories/:id": "categories.manage",
  "GET /products": "auth",
  "GET /products/barcode/:barcode": "auth",
  "GET /products/pricing-requests": "products.price|products.manage",
  "PATCH /products/pricing-requests/:id": "products.price|products.manage",
  "POST /products": "products.details|products.manage",
  "PATCH /products/:id/pricing": "products.price|products.manage",
  "GET /products/:id": "auth",
  "PATCH /products/:id": "products.details|products.price|products.manage",
  "DELETE /products/:id": "products.manage",
  "GET /orders/reports/item-sales": "orders.items",
  "GET /orders": "orders.view|pos.projects",
  "POST /orders/:id/void": "orders.void",
  "GET /orders/:id": "orders.view|pos.projects",
  "POST /orders/project": "pos.projects",
  "PATCH /orders/:id/project": "pos.projects",
  "POST /orders/:id/project/payments": "pos.projects",
  "POST /orders/:id/project/submit": "pos.projects",
  "POST /orders": "pos.sales",
  "GET /customers": "customers.view|customers.manage|pos.sales|pos.loyalty|pos.projects|calendar.view|calendar.manage",
  "POST /customers/enroll": "pos.loyalty",
  "POST /customers/pos": "pos.sales",
  "GET /customers/:id": "customers.view|customers.manage",
  "POST /customers": "customers.manage",
  "PATCH /customers/:id": "customers.manage",
  "DELETE /customers/:id": "customers.manage",
  "GET /users/cashiers": "auth",
  "GET /users": "staff.manage",
  "POST /users": "staff.manage",
  "PATCH /users/:id": "staff.manage",
  "GET /access/catalog": "roles.manage",
  "GET /access/roles": "roles.manage",
  "POST /access/roles": "roles.manage",
  "PATCH /access/roles/:id": "roles.manage",
  "DELETE /access/roles/:id": "roles.manage",
  "GET /access/role-policies": "roles.manage",
  "PATCH /access/role-policies": "roles.manage",
  "GET /stock-movements": "stock.view|stock.adjust",
  "POST /stock-movements/adjust": "stock.adjust",
  "GET /calendar": "calendar.view|calendar.manage",
  "GET /calendar/:id": "calendar.view|calendar.manage",
  "POST /calendar": "calendar.manage",
  "PATCH /calendar/:id": "calendar.manage",
  "POST /calendar/:id/payments": "calendar.manage",
  "POST /calendar/:id/complete": "calendar.manage",
  "DELETE /calendar/:id": "calendar.manage",
  "GET /vendors/options": "vendors.view|vendors.record|vendors.manage|products.details|products.manage",
  "GET /vendors/invoices": "vendors.view|vendors.record|vendors.manage",
  "GET /vendors/payments": "vendors.view|vendors.record|vendors.manage",
  "GET /vendors/balances": "vendors.view|vendors.manage",
  "POST /vendors": "vendors.manage",
  "POST /vendors/invoices": "vendors.record|vendors.manage",
  "POST /vendors/sync-from-projects": "vendors.manage",
  "POST /vendors/payments": "vendors.record|vendors.manage",
  "GET /uploads/files/*": "signed-url",
  "POST /uploads/attachment": "pos.projects|calendar.manage|vendors.record|vendors.manage",
  "POST /uploads/vendor-attachment": "vendors.record|vendors.manage",
};

describe("route permission matrix", () => {
  it("lists every route in the expected table", () => {
    const seen = app.routes
      .filter((route) => route.method !== "ALL")
      .map((route) => `${route.method} ${route.path}`);
    const unique = [...new Set(seen)].sort();
    const missing = unique.filter((key) => !(key in ROUTE_PERMISSIONS));
    const extra = Object.keys(ROUTE_PERMISSIONS).filter((key) => !unique.includes(key));
    expect({ missing, extra, unique }).toEqual({ missing: [], extra: [], unique });
  });
});

describe("login and sessions", () => {
  it("logs in with a hashed PIN and clears the plain-text column", async () => {
    const store = await createStore();
    const { user, pin } = await createUser(store.id, { role: "ADMIN", phone: "0501111111" });
    await prisma.user.update({
      where: { id: user.id },
      data: { pin: "654321", pinHash: null },
    });

    const response = await api("POST", "/auth/login", {
      body: { phone: "0501111111", pin: "654321" },
    });
    expect(response.status).toBe(200);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.pin).toBeNull();
    expect(saved.pinHash).toBeTruthy();
    expect(pin).toBe("123456");
  });

  it("locks the account after 5 wrong PINs", async () => {
    const store = await createStore();
    const { user } = await createUser(store.id, { phone: "0502222222", pin: "123456" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api("POST", "/auth/login", {
        body: { phone: "0502222222", pin: "000000" },
        headers: { "x-forwarded-for": "203.0.113.10" },
      });
      expect(response.status).toBe(401);
    }
    const locked = await api("POST", "/auth/login", {
      body: { phone: "0502222222", pin: "123456" },
      headers: { "x-forwarded-for": "203.0.113.11" },
    });
    expect(locked.status).toBe(429);
    await prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const again = await api("POST", "/auth/login", {
      body: { phone: "0502222222", pin: "123456" },
      headers: { "x-forwarded-for": "203.0.113.12" },
    });
    expect(again.status).toBe(200);
  });

  it("rate limits failed logins per IP", async () => {
    const store = await createStore();
    await createUser(store.id, { phone: "0503333333", pin: "123456" });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await api("POST", "/auth/login", {
        body: { phone: "0509999999", pin: "000000" },
        headers: { "x-forwarded-for": "198.51.100.8" },
      });
      expect(response.status).toBe(401);
    }
    const blocked = await api("POST", "/auth/login", {
      body: { phone: "0509999999", pin: "000000" },
      headers: { "x-forwarded-for": "198.51.100.8" },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("rejects a deactivated user and a token from before a PIN change", async () => {
    const store = await createStore();
    const { user } = await createUser(store.id, { role: "ADMIN", phone: "0504444444" });
    const token = await tokenFor(user);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const customers = await api("GET", "/customers", { token });
    const products = await api("GET", "/products", { token });
    expect(customers.status).toBe(401);
    expect(products.status).toBe(401);

    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true, tokenVersion: 1 },
    });
    const stale = await api("GET", "/products", { token });
    expect(stale.status).toBe(401);
    const fresh = await tokenFor({ ...user, tokenVersion: 1 });
    const ok = await api("GET", "/products", { token: fresh });
    expect(ok.status).toBe(200);
  });

  it("accepts a token issued before token versions existed", async () => {
    const store = await createStore();
    const { user } = await createUser(store.id, { role: "ADMIN" });
    const token = await legacyToken(user);
    const response = await api("GET", "/store", { token });
    expect(response.status).toBe(200);
  });

  it("rejects a token signed with another secret", async () => {
    const store = await createStore();
    const { user } = await createUser(store.id, { role: "ADMIN" });
    const forged = await new SignJWT({ storeId: user.storeId, role: user.role, tv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("dapos-dev-secret-change-me-but-longer"));
    const response = await api("GET", "/products", { token: forged });
    expect(response.status).toBe(401);
  });
});

describe("staff grants", () => {
  it("stops a staff manager from escalating access", async () => {
    const store = await createStore();
    const { user: admin } = await createUser(store.id, {
      role: "ADMIN",
      phone: "0505555551",
      name: "Admin",
    });
    const { user: manager } = await createUser(store.id, {
      role: "MANAGER",
      phone: "0505555552",
      permissions: ["staff.manage"],
    });
    const { user: cashier } = await createUser(store.id, {
      role: "CASHIER",
      phone: "0505555553",
    });
    const token = await tokenFor(manager);
    const adminToken = await tokenFor(admin);

    const own = await api("PATCH", `/users/${manager.id}`, {
      token,
      body: { customPolicies: ["staff.manage", "roles.manage"] },
    });
    expect(own.status).toBe(403);

    const editAdmin = await api("PATCH", `/users/${admin.id}`, {
      token,
      body: { pin: "654321" },
    });
    expect(editAdmin.status).toBe(403);

    const makeAdmin = await api("PATCH", `/users/${cashier.id}`, {
      token,
      body: { role: "ADMIN" },
    });
    expect(makeAdmin.status).toBe(403);

    const grant = await api("PATCH", `/users/${cashier.id}`, {
      token,
      body: { customPolicies: ["pos.sales"] },
    });
    expect(grant.status).toBe(403);

    const shortPin = await api("POST", "/users", {
      token: adminToken,
      body: {
        name: "New",
        phone: "0505555554",
        pin: "1234",
        role: "CASHIER",
      },
    });
    expect(shortPin.status).toBe(400);

    const created = await api("POST", "/users", {
      token: adminToken,
      body: {
        name: "New",
        phone: "0505555554",
        pin: "654321",
        role: "CASHIER",
      },
    });
    expect(created.status).toBe(201);
    const row = await prisma.user.findFirstOrThrow({
      where: { phone: "0505555554" },
    });
    expect(row.pin).toBeNull();
    expect(row.pinHash).toBeTruthy();
  });

  it("refuses to deactivate the last admin", async () => {
    const store = await createStore();
    const { user: admin } = await createUser(store.id, { role: "ADMIN", phone: "0506666661" });
    const { user: other } = await createUser(store.id, { role: "ADMIN", phone: "0506666662" });
    const token = await tokenFor(admin);
    const removed = await api("PATCH", `/users/${other.id}`, {
      token,
      body: { isActive: false },
    });
    expect(removed.status).toBe(200);
    const blocked = await api("PATCH", `/users/${admin.id}`, {
      token,
      body: { isActive: false },
    });
    expect(blocked.status).toBe(400);
  });
});

describe("customer and stock permissions", () => {
  it("lets a cashier sell without exposing customer details", async () => {
    const store = await createStore();
    const { user } = await createUser(store.id, { role: "CASHIER" });
    const token = await tokenFor(user);
    await prisma.customer.create({
      data: {
        storeId: store.id,
        name: "Ada",
        phone: "0507777777",
        email: "ada@example.com",
        notes: "private",
        loyaltyEnrolled: true,
      },
    });

    const list = await api("GET", "/customers?loyalty=true", { token });
    expect(list.status).toBe(200);
    const customers = list.data.customers as Array<Record<string, unknown>>;
    expect(customers[0]).not.toHaveProperty("email");
    expect(customers[0]).not.toHaveProperty("notes");
    expect(customers[0]?.name).toBe("Ada");

    const stats = await api("GET", "/customers?stats=true", { token });
    expect(stats.status).toBe(403);
    const one = await api("GET", `/customers/${customers[0]?.id}`, { token });
    expect(one.status).toBe(403);
    const stock = await api("GET", "/stock-movements", { token });
    expect(stock.status).toBe(403);
    const huge = await api("GET", "/stock-movements?limit=100000", { token: await tokenFor((await createUser(store.id, { role: "ADMIN" })).user) });
    expect(huge.status).toBe(400);

    const renamed = await api("POST", "/customers/pos", {
      token,
      body: { name: "Changed", phone: "0507777777" },
    });
    expect(renamed.status).toBe(200);
    const saved = await prisma.customer.findFirstOrThrow({ where: { storeId: store.id } });
    expect(saved.name).toBe("Ada");
  });
});

describe("sales integrity", () => {
  it("rejects another store's customer and over-discount", async () => {
    const storeA = await createStore("A");
    const storeB = await createStore("B");
    const { user } = await createUser(storeA.id, { role: "ADMIN" });
    const token = await tokenFor(user);
    const product = await createPricedProduct(storeA.id, { onStock: 5, price: 10 });
    const foreign = await prisma.customer.create({
      data: { storeId: storeB.id, name: "Other", phone: "0508888888" },
    });

    const sale = await api("POST", "/orders", {
      token,
      body: {
        items: [{ productId: product.id, quantity: 1 }],
        paymentMethod: "CASH",
        customerId: foreign.id,
      },
    });
    expect(sale.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);

    const discount = await api("POST", "/orders", {
      token,
      body: {
        items: [{ productId: product.id, quantity: 1, discount: 11 }],
        paymentMethod: "CASH",
      },
    });
    expect(discount.status).toBe(400);
  });

  it("completes parallel checkouts and keeps distinct order numbers", async () => {
    const store = await createStore();
    const { user } = await createUser(store.id, { role: "ADMIN" });
    const token = await tokenFor(user);
    const product = await createPricedProduct(store.id, { onStock: 1, name: "Cola" });
    const body = {
      items: [{ productId: product.id, quantity: 1 }],
      paymentMethod: "CASH",
    };
    const [first, second] = await Promise.all([
      api("POST", "/orders", { token, body }),
      api("POST", "/orders", { token, body }),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const saved = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(saved.onStock).toBe(-1);
    expect(await prisma.stockMovement.count({ where: { type: "SALE" } })).toBe(2);

    const plenty = await createPricedProduct(store.id, { onStock: 30, barcode: "plenty" });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        api("POST", "/orders", {
          token,
          body: {
            items: [{ productId: plenty.id, quantity: 1 }],
            paymentMethod: "CASH",
          },
        }),
      ),
    );
    expect(results.every((result) => result.status === 201)).toBe(true);
    const numbers = results.map((result) => (result.data.order as { orderNumber: string }).orderNumber);
    expect(new Set(numbers).size).toBe(20);
  });

  it("voids once and reverses loyalty points", async () => {
    const store = await createStore();
    const { user } = await createUser(store.id, { role: "ADMIN" });
    const token = await tokenFor(user);
    const product = await createPricedProduct(store.id, { onStock: 5, price: 12 });
    const customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        name: "Loyal",
        phone: "0501212121",
        loyaltyEnrolled: true,
        loyaltyPoints: 0,
      },
    });
    const sale = await api("POST", "/orders", {
      token,
      body: {
        items: [{ productId: product.id, quantity: 1 }],
        paymentMethod: "CASH",
        customerId: customer.id,
      },
    });
    expect(sale.status).toBe(201);
    const orderId = (sale.data.order as { id: string }).id;
    const afterSale = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(afterSale.loyaltyPoints).toBe(12);

    const [voided, duplicate] = await Promise.all([
      api("POST", `/orders/${orderId}/void`, { token }),
      api("POST", `/orders/${orderId}/void`, { token }),
    ]);
    const voidStatuses = [voided.status, duplicate.status].sort();
    expect(voidStatuses).toEqual([200, 400]);
    const stock = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stock.onStock).toBe(5);
    expect(await prisma.stockMovement.count({ where: { type: "VOID" } })).toBe(1);
    const afterVoid = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(afterVoid.loyaltyPoints).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "order.void" } })).toBe(1);
  });
});

describe("uploads", () => {
  it("rejects an SVG and requires a signature for vendor files", async () => {
    const store = await createStore();
    const { user } = await createUser(store.id, { role: "ADMIN" });
    const token = await tokenFor(user);
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>").toString("base64")}`;
    const rejected = await api("POST", "/uploads/vendor-attachment", {
      token,
      body: { imageDataUrl: svg },
    });
    expect(rejected.status).toBe(400);

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const uploaded = await api("POST", "/uploads/vendor-attachment", {
      token,
      body: {
        imageDataUrl: `data:image/svg+xml;base64,${png.toString("base64")}`,
      },
    });
    expect(uploaded.status).toBe(201);
    const key = uploaded.data.key as string;
    expect(key.endsWith(".png")).toBe(true);

    const hidden = await app.request(`/uploads/files/${key}`);
    expect(hidden.status).toBe(403);

    const { resolveAttachmentUrl } = await import("../src/lib/object-storage.js");
    const signed = await resolveAttachmentUrl(key, "http://localhost:3000/uploads/files/x");
    const signedUrl = new URL(signed!);
    const opened = await app.request(signedUrl.pathname + signedUrl.search);
    expect(opened.status).toBe(200);

    const expired = await app.request(`/uploads/files/${key}?exp=1&sig=bad`);
    expect(expired.status).toBe(403);
  });
});

describe("request limits", () => {
  it("rejects an oversized login body", async () => {
    const response = await api("POST", "/auth/login", {
      body: { phone: "0501234567", pin: "1".repeat(20_000) },
    });
    expect(response.status).toBe(413);
  });
});
