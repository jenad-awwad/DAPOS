import { OrderStatus, OrderType } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { errorResponse } from "../lib/errors.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";
import {
  createManualVendorInvoice,
  createVendor,
  createVendorPayment,
  listVendorBalances,
  listVendorInvoices,
  listVendorOptions,
  listVendorPayments,
  syncProjectOrderVendorInvoices,
} from "../services/vendors.js";

export const vendorRoutes = new Hono<AppEnv>();

const dateField = z.union([
  z.string().datetime(),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
]);

const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  startingBalance: z.number().min(0).optional(),
});

const createInvoiceSchema = z.object({
  vendorId: z.string().optional(),
  vendorName: z.string().trim().min(1).max(200).optional(),
  invoiceDate: dateField,
  invoiceNumber: z.string().trim().min(1).max(80).optional(),
  invoiceNumberAuto: z.boolean().optional(),
  total: z.number().positive(),
  attachmentKey: z.string().trim().min(1).optional().nullable(),
});

const createPaymentSchema = z.object({
  vendorId: z.string().optional(),
  vendorName: z.string().trim().min(1).max(200).optional(),
  paidAt: dateField,
  amount: z.number().positive(),
  attachmentKey: z.string().trim().min(1).optional().nullable(),
});

function parseLedgerDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }
  return new Date(value);
}

vendorRoutes.get(
  "/options",
  requireAuth,
  requireAnyPermission(
    "vendors.view",
    "vendors.record",
    "vendors.manage",
    "products.details",
    "products.manage",
  ),
  async (c) => {
    const { storeId } = c.get("auth");
    const vendors = await listVendorOptions(storeId);
    return c.json({ vendors: serialize(vendors) });
  },
);

vendorRoutes.get(
  "/invoices",
  requireAuth,
  requireAnyPermission("vendors.view", "vendors.record", "vendors.manage"),
  async (c) => {
    const { storeId } = c.get("auth");
    const invoices = await listVendorInvoices(storeId, c.req.url);
    return c.json({ invoices: serialize(invoices) });
  },
);

vendorRoutes.get(
  "/payments",
  requireAuth,
  requireAnyPermission("vendors.view", "vendors.record", "vendors.manage"),
  async (c) => {
    const { storeId } = c.get("auth");
    const payments = await listVendorPayments(storeId, c.req.url);
    return c.json({ payments: serialize(payments) });
  },
);

vendorRoutes.get(
  "/balances",
  requireAuth,
  requireAnyPermission("vendors.view", "vendors.manage"),
  async (c) => {
    const { storeId } = c.get("auth");
    const balances = await listVendorBalances(storeId);
    return c.json({ balances: serialize(balances) });
  },
);

vendorRoutes.post(
  "/",
  requireAuth,
  requireAnyPermission("vendors.manage"),
  async (c) => {
    const { storeId } = c.get("auth");
    const body = await c.req.json().catch(() => null);
    const parsed = createVendorSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid vendor", details: parsed.error.flatten() }, 400);
    }

    try {
      const vendor = await createVendor(storeId, parsed.data);
      return c.json({ vendor: serialize(vendor) }, 201);
    } catch (error) {
      return errorResponse(c, error, "Could not create vendor");
    }
  },
);

vendorRoutes.post(
  "/invoices",
  requireAuth,
  requireAnyPermission("vendors.record", "vendors.manage"),
  async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => null);
    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid invoice", details: parsed.error.flatten() }, 400);
    }

    if (!parsed.data.vendorId && !parsed.data.vendorName) {
      return c.json({ error: "Vendor is required" }, 400);
    }

    try {
      const invoice = await createManualVendorInvoice({
        storeId: auth.storeId,
        userId: auth.sub,
        vendorId: parsed.data.vendorId,
        vendorName: parsed.data.vendorName,
        invoiceDate: parseLedgerDate(parsed.data.invoiceDate),
        invoiceNumber: parsed.data.invoiceNumber,
        invoiceNumberAuto: parsed.data.invoiceNumberAuto,
        total: parsed.data.total,
        attachmentKey: parsed.data.attachmentKey,
      });
      return c.json({ invoice: serialize(invoice) }, 201);
    } catch (error) {
      return errorResponse(c, error, "Could not create invoice");
    }
  },
);

vendorRoutes.post(
  "/sync-from-projects",
  requireAuth,
  requireAnyPermission("vendors.manage"),
  async (c) => {
    const { storeId } = c.get("auth");
    const orders = await prisma.order.findMany({
      where: {
        storeId,
        orderType: OrderType.PROJECT,
        status: { notIn: [OrderStatus.VOIDED] },
      },
      select: { id: true, orderNumber: true, createdAt: true },
    });

    for (const order of orders) {
      await prisma.$transaction(async (tx) => {
        await syncProjectOrderVendorInvoices(
          tx,
          storeId,
          order.id,
          order.orderNumber,
          order.createdAt,
        );
      });
    }

    return c.json({ ok: true, syncedOrders: orders.length });
  },
);

vendorRoutes.post(
  "/payments",
  requireAuth,
  requireAnyPermission("vendors.record", "vendors.manage"),
  async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => null);
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid payment", details: parsed.error.flatten() }, 400);
    }

    if (!parsed.data.vendorId && !parsed.data.vendorName) {
      return c.json({ error: "Vendor is required" }, 400);
    }

    try {
      const payment = await createVendorPayment({
        storeId: auth.storeId,
        userId: auth.sub,
        vendorId: parsed.data.vendorId,
        vendorName: parsed.data.vendorName,
        paidAt: parseLedgerDate(parsed.data.paidAt),
        amount: parsed.data.amount,
        attachmentKey: parsed.data.attachmentKey,
      });
      return c.json({ payment: serialize(payment) }, 201);
    } catch (error) {
      return errorResponse(c, error, "Could not create payment");
    }
  },
);
