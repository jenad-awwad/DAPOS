import { Hono } from "hono";
import { CalendarEventType, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { canViewCost } from "../lib/cost-visibility.js";
import { zDateTimeString } from "../lib/datetime.js";
import { withAttachmentUrl } from "../lib/object-storage.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { loadUserPermissions, requireAnyPermission } from "../middleware/permissions.js";
import { userHasPermission, type PermissionKey } from "../lib/permissions.js";
import { prisma } from "../lib/prisma.js";
import { voidOrder } from "../services/order-actions.js";
import { createSale, getOrder, getItemSalesReport, listOrders } from "../services/orders.js";
import {
  createOpenProject,
  recordProjectPayment,
  submitOpenProject,
  updateOpenProject,
} from "../services/project-orders.js";

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
        unitPrice: z.coerce.number().min(0).optional(),
        discount: z.coerce.number().min(0).optional(),
      }),
    )
    .min(1),
  paymentMethod: z.nativeEnum(PaymentMethod),
  customerId: z.string().optional(),
  notes: z.string().optional(),
  discountTotal: z.coerce.number().min(0).optional(),
});

const createProjectOrderSchema = z.object({
  projectTitle: z.string().trim().min(1),
  sellQuantity: z.number().positive(),
  sellUnitPrice: z.number().min(0),
  materials: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        vendor: z.string().trim().min(1),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
        notes: z.string().optional(),
      }),
    )
    .optional(),
  customerId: z.string().optional(),
  customerName: z.string().trim().min(1).optional(),
  customerPhone: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  attachmentKey: z.string().trim().min(1).nullable().optional(),
  discountTotal: z.number().min(0).optional(),
  scheduleAt: zDateTimeString.optional(),
  scheduleType: z.nativeEnum(CalendarEventType).optional(),
});

const updateProjectOrderSchema = createProjectOrderSchema.partial();

const submitProjectOrderSchema = z.object({}).optional();

const recordProjectPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.nativeEnum(PaymentMethod),
});

const listOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  orderNumber: z.string().trim().min(1).optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  orderType: z.nativeEnum(OrderType).optional(),
  paymentOpen: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  cashierId: z.string().min(1).optional(),
  dateFrom: zDateTimeString.optional(),
  dateTo: zDateTimeString.optional(),
});

const itemSalesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  cashierId: z.string().min(1).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

async function presentOrder<T extends { attachmentKey?: string | null }>(
  order: T,
  requestUrl: string,
) {
  return serialize(await withAttachmentUrl(order, requestUrl));
}

async function presentOrders<T extends { attachmentKey?: string | null }>(
  orders: T[],
  requestUrl: string,
) {
  return serialize(
    await Promise.all(orders.map((order) => withAttachmentUrl(order, requestUrl))),
  );
}

const OTHER_PAYMENTS: PaymentMethod[] = [
  PaymentMethod.DEBIT,
  PaymentMethod.BREAKAGE,
  PaymentMethod.DELIVERY,
];

async function saleFeatureDenial(
  storeId: string,
  permissions: PermissionKey[],
  data: {
    items: { productId: string; unitPrice?: number; discount?: number }[];
    discountTotal?: number;
    paymentMethod: PaymentMethod;
    customerId?: string;
  },
): Promise<string | null> {
  const hasDiscount =
    (data.discountTotal ?? 0) > 0 || data.items.some((item) => (item.discount ?? 0) > 0);
  if (hasDiscount && !userHasPermission(permissions, "pos.discount")) {
    return "Invoice discounts are not allowed for this role";
  }

  if (
    OTHER_PAYMENTS.includes(data.paymentMethod) &&
    !userHasPermission(permissions, "pos.payments.other")
  ) {
    return "This payment method is not allowed for this role";
  }

  if (
    data.customerId &&
    data.paymentMethod !== PaymentMethod.DEBIT &&
    !userHasPermission(permissions, "pos.loyalty")
  ) {
    return "Loyalty sales are not allowed for this role";
  }

  if (!userHasPermission(permissions, "pos.price")) {
    const products = await prisma.product.findMany({
      where: { storeId, id: { in: data.items.map((item) => item.productId) } },
      select: { id: true, price: true },
    });
    const prices = new Map(products.map((product) => [product.id, Number(product.price)]));
    for (const item of data.items) {
      if (item.unitPrice === undefined) continue;
      const catalog = prices.get(item.productId);
      if (catalog == null) continue;
      if (Math.round(item.unitPrice * 100) !== Math.round(catalog * 100)) {
        return "Changing the selling price is not allowed for this role";
      }
    }
  }

  return null;
}

export const orderRoutes = new Hono<AppEnv>();

orderRoutes.get("/reports/item-sales", requireAuth, async (c) => {
  const auth = c.get("auth");
  const permissions = await loadUserPermissions(auth.storeId, auth.sub);
  if (!userHasPermission(permissions, "orders.items")) {
    return c.json({ error: "You do not have permission to view item sales" }, 403);
  }
  const { storeId } = auth;
  const parsed = itemSalesQuerySchema.safeParse({
    search: c.req.query("search"),
    cashierId: c.req.query("cashierId"),
    dateFrom: c.req.query("dateFrom"),
    dateTo: c.req.query("dateTo"),
  });

  if (!parsed.success) {
    return c.json({ error: "Invalid report filters", details: parsed.error.flatten() }, 400);
  }

  const report = await getItemSalesReport(storeId, {
    search: parsed.data.search,
    cashierId: parsed.data.cashierId,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
    includeCost: canViewCost(permissions),
  });

  return c.json(serialize(report));
});

orderRoutes.get("/", requireAuth, async (c) => {
  const auth = c.get("auth");
  const permissions = await loadUserPermissions(auth.storeId, auth.sub);
  const canViewOrders = userHasPermission(permissions, "orders.view");
  const canOpenProjects = userHasPermission(permissions, "pos.projects");

  if (!canViewOrders && !canOpenProjects) {
    return c.json({ error: "You do not have permission to view orders" }, 403);
  }

  const parsed = listOrdersQuerySchema.safeParse({
    limit: c.req.query("limit"),
    orderNumber: c.req.query("orderNumber"),
    status: c.req.query("status"),
    orderType: c.req.query("orderType"),
    paymentOpen: c.req.query("paymentOpen"),
    cashierId: c.req.query("cashierId"),
    dateFrom: c.req.query("dateFrom"),
    dateTo: c.req.query("dateTo"),
  });

  if (!parsed.success) {
    return c.json({ error: "Invalid order filters", details: parsed.error.flatten() }, 400);
  }

  const orders = await listOrders(auth.storeId, {
    limit: parsed.data.limit ?? 100,
    orderNumber: parsed.data.orderNumber,
    status: parsed.data.status,
    orderType: canViewOrders ? parsed.data.orderType : OrderType.PROJECT,
    paymentOpen: parsed.data.paymentOpen,
    cashierId: parsed.data.cashierId,
    dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
    dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
  });
  return c.json({ orders: await presentOrders(orders, c.req.url) });
});

orderRoutes.post("/:id/void", requireAuth, requireAnyPermission("orders.void"), async (c) => {
  const auth = c.get("auth");

  try {
    const order = await voidOrder(auth.storeId, c.req.param("id"), auth.sub);
    return c.json({ order: await presentOrder(order, c.req.url) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not void order";
    return c.json({ error: message }, 400);
  }
});

orderRoutes.get("/:id", requireAuth, async (c) => {
  const auth = c.get("auth");
  const order = await getOrder(auth.storeId, c.req.param("id"));

  if (!order) {
    return c.json({ error: "Order not found" }, 404);
  }

  const permissions = await loadUserPermissions(auth.storeId, auth.sub);
  const canViewOrders = userHasPermission(permissions, "orders.view");
  const canOpenProjects = userHasPermission(permissions, "pos.projects");

  if (order.orderType === OrderType.PROJECT) {
    if (!canViewOrders && !canOpenProjects) {
      return c.json(
        { error: "You do not have permission to open this project" },
        403,
      );
    }
  } else if (!canViewOrders) {
    return c.json({ error: "You do not have permission to view this order" }, 403);
  }

  return c.json({ order: await presentOrder(order, c.req.url) });
});

orderRoutes.post("/project", requireAuth, requireAnyPermission("pos.projects"), async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = createProjectOrderSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid project order payload", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const order = await createOpenProject({
      storeId: auth.storeId,
      cashierId: auth.sub,
      projectTitle: parsed.data.projectTitle,
      sellQuantity: parsed.data.sellQuantity,
      sellUnitPrice: parsed.data.sellUnitPrice,
      materials: parsed.data.materials,
      customerId: parsed.data.customerId,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      notes: parsed.data.notes,
      attachmentKey: parsed.data.attachmentKey,
      discountTotal: parsed.data.discountTotal,
      scheduleAt: parsed.data.scheduleAt
        ? new Date(parsed.data.scheduleAt)
        : undefined,
      scheduleType: parsed.data.scheduleType,
    });

    return c.json({ order: await presentOrder(order, c.req.url) }, 201);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create project order";
    return c.json({ error: message }, 400);
  }
});

orderRoutes.patch("/:id/project", requireAuth, requireAnyPermission("pos.projects"), async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = updateProjectOrderSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid project update payload", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const order = await updateOpenProject({
      storeId: auth.storeId,
      orderId: c.req.param("id"),
      userId: auth.sub,
      projectTitle: parsed.data.projectTitle,
      sellQuantity: parsed.data.sellQuantity,
      sellUnitPrice: parsed.data.sellUnitPrice,
      materials: parsed.data.materials,
      customerId: parsed.data.customerId,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      notes: parsed.data.notes,
      attachmentKey: parsed.data.attachmentKey,
      discountTotal: parsed.data.discountTotal,
      scheduleAt: parsed.data.scheduleAt
        ? new Date(parsed.data.scheduleAt)
        : undefined,
      scheduleType: parsed.data.scheduleType,
    });

    return c.json({ order: await presentOrder(order, c.req.url) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update project order";
    return c.json({ error: message }, 400);
  }
});

orderRoutes.post("/:id/project/payments", requireAuth, requireAnyPermission("pos.projects"), async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = recordProjectPaymentSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid partial payment payload", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const order = await recordProjectPayment({
      storeId: auth.storeId,
      orderId: c.req.param("id"),
      userId: auth.sub,
      amount: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod,
    });

    return c.json({ order: await presentOrder(order, c.req.url) }, 201);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not record partial payment";
    return c.json({ error: message }, 400);
  }
});

orderRoutes.post("/:id/project/submit", requireAuth, requireAnyPermission("pos.projects"), async (c) => {
  const auth = c.get("auth");

  try {
    const order = await submitOpenProject({
      storeId: auth.storeId,
      orderId: c.req.param("id"),
      cashierId: auth.sub,
    });

    return c.json({ order: await presentOrder(order, c.req.url) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not submit project order";
    return c.json({ error: message }, 400);
  }
});

orderRoutes.post("/", requireAuth, requireAnyPermission("pos.sales"), async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid order payload", details: parsed.error.flatten() }, 400);
  }

  const permissions = await loadUserPermissions(auth.storeId, auth.sub);
  const denied = await saleFeatureDenial(auth.storeId, permissions, parsed.data);
  if (denied) {
    return c.json({ error: denied }, 403);
  }

  try {
    const order = await createSale({
      storeId: auth.storeId,
      cashierId: auth.sub,
      items: parsed.data.items,
      paymentMethod: parsed.data.paymentMethod,
      customerId: parsed.data.customerId,
      notes: parsed.data.notes,
      discountTotal: parsed.data.discountTotal,
    });

    return c.json({ order: await presentOrder(order, c.req.url) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create order";
    return c.json({ error: message }, 400);
  }
});
