import { execSync } from "node:child_process";
import { beforeEach } from "vitest";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";
if (!url) {
  throw new Error("Set TEST_DATABASE_URL to a local Postgres database before running tests");
}

let host = "";
try {
  host = new URL(url).hostname;
} catch {
  throw new Error("TEST_DATABASE_URL is not a valid URL");
}

if (host !== "localhost" && host !== "127.0.0.1" && process.env.CI !== "true") {
  throw new Error(`Refusing to run tests against ${host}`);
}

process.env.DATABASE_URL = url;
process.env.JWT_SECRET ??= "test-jwt-secret-must-be-32-characters-min";
process.env.PIN_PEPPER ??= "test-pin-pepper-must-be-32-characters-min";
process.env.NODE_ENV ??= "test";

const globalState = globalThis as { __daposMigrated?: boolean };
if (!globalState.__daposMigrated) {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
  globalState.__daposMigrated = true;
}

const { prisma } = await import("../src/lib/prisma.js");
const { resetLoginRateLimit } = await import("../src/middleware/rate-limit.js");

beforeEach(async () => {
  resetLoginRateLimit();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs",
      "stock_movements",
      "payments",
      "order_items",
      "order_project_materials",
      "order_project_adjustments",
      "calendar_event_payments",
      "calendar_events",
      "vendor_invoices",
      "vendor_payments",
      "product_pricing_requests",
      "orders",
      "products",
      "categories",
      "customers",
      "users",
      "store_roles",
      "vendors",
      "stores"
    RESTART IDENTITY CASCADE
  `);
});
