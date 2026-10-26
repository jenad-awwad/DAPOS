import { Hono } from "hono";

import { cors } from "hono/cors";

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



export const app = new Hono<AppEnv>();



app.use("*", cors());

mountPortalPages(app);



app.get("/health", (c) => c.json({ status: "ok", service: "dapos-api" }));



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

