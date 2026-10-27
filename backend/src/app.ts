import { Hono } from "hono";

import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { storageMode } from "./lib/object-storage.js";

import { authRoutes } from "./routes/auth.js";

import { storeRoutes } from "./routes/store.js";

import { categoryRoutes } from "./routes/categories.js";

import { productRoutes } from "./routes/products.js";

import { orderRoutes } from "./routes/orders.js";

import { customerRoutes } from "./routes/customers.js";

import { userRoutes } from "./routes/users.js";

import { accessRoutes } from "./routes/access.js";

import { stockMovementRoutes } from "./routes/stock-movements.js";

import { calendarRoutes } from "./routes/calendar.js";

import { vendorRoutes } from "./routes/vendors.js";

import { uploadRoutes } from "./routes/uploads.js";

import { mountPortalAssets, mountPortalPages } from "./lib/portal.js";

import type { AppEnv } from "./middleware/auth.js";



function corsOrigins(): string[] | null {
  const configured = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  if (process.env.NODE_ENV === "production") {
    console.warn("CORS_ORIGINS is unset; allowing every origin until it is configured");
    return null;
  }
  return ["http://localhost:5173", "http://localhost:8081"];
}

function maxBodyBytes(path: string): number {
  if (path === "/auth" || path.startsWith("/auth/")) return 8 * 1024;
  if (path === "/uploads" || path.startsWith("/uploads/")) return 8 * 1024 * 1024;
  if (path === "/products" || path.startsWith("/products/")) return 4 * 1024 * 1024;
  return 1024 * 1024;
}

export const app = new Hono<AppEnv>();

const origins = corsOrigins();
app.use("*", origins ? cors({ origin: origins }) : cors());
app.use(
  "*",
  secureHeaders({
    crossOriginResourcePolicy: "cross-origin",
  }),
);
app.use("*", async (c, next) => {
  const limit = bodyLimit({
    maxSize: maxBodyBytes(c.req.path),
    onError: (c) => c.json({ error: "Request too large" }, 413),
  });
  return limit(c, next);
});

mountPortalPages(app);



app.get("/health", (c) =>
  c.json({ status: "ok", service: "dapos-api", storage: storageMode() }),
);



app.route("/auth", authRoutes);

app.route("/store", storeRoutes);

app.route("/categories", categoryRoutes);

app.route("/products", productRoutes);

app.route("/orders", orderRoutes);

app.route("/customers", customerRoutes);

app.route("/users", userRoutes);

app.route("/access", accessRoutes);

app.route("/stock-movements", stockMovementRoutes);

app.route("/calendar", calendarRoutes);

app.route("/vendors", vendorRoutes);

app.route("/uploads", uploadRoutes);

mountPortalAssets(app);



app.notFound((c) => c.json({ error: "Not found" }, 404));



app.onError((err, c) => {

  console.error(err);

  return c.json({ error: "Internal server error" }, 500);

});

