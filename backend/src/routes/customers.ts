import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { phoneCandidates } from "../lib/phone.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";
import { userHasPermission, type PermissionKey } from "../lib/permissions.js";
import { listCustomersWithStats } from "../services/customers.js";

const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  loyaltyEnrolled: z.boolean().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

const enrollSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().nullable(),
  customerId: z.string().optional(),
});

const posCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(7).max(20),
});

export const customerRoutes = new Hono<AppEnv>();

const listCustomersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  loyalty: z.enum(["true", "false"]).optional(),
  stats: z.enum(["true", "false"]).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  orderMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

const CUSTOMER_LIST_PERMISSIONS = [
  "customers.view",
  "customers.manage",
  "pos.sales",
  "pos.loyalty",
  "pos.projects",
  "calendar.view",
  "calendar.manage",
] as const;

function canSeeCustomerDetails(permissions: PermissionKey[]) {
  return (
    userHasPermission(permissions, "customers.view") ||
    userHasPermission(permissions, "customers.manage")
  );
}

customerRoutes.get(
  "/",
  requireAuth,
  requireAnyPermission(...CUSTOMER_LIST_PERMISSIONS),
  async (c) => {
  const { storeId } = c.get("auth");
  const permissions = c.get("permissions");
  const parsed = listCustomersQuerySchema.safeParse({
    search: c.req.query("search"),
    loyalty: c.req.query("loyalty"),
    stats: c.req.query("stats"),
    createdFrom: c.req.query("createdFrom"),
    createdTo: c.req.query("createdTo"),
    orderMonth: c.req.query("orderMonth"),
  });

  if (!parsed.success) {
    return c.json({ error: "Invalid customer filters", details: parsed.error.flatten() }, 400);
  }

  const loyaltyOnly = parsed.data.loyalty === "true";
  const nonLoyaltyOnly = parsed.data.loyalty === "false";
  const withStats = parsed.data.stats === "true";
  const fullDetails = canSeeCustomerDetails(permissions);

  if (withStats && !fullDetails) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (withStats) {
    const report = await listCustomersWithStats(storeId, {
      search: parsed.data.search,
      loyaltyOnly: loyaltyOnly || undefined,
      nonLoyaltyOnly: nonLoyaltyOnly || undefined,
      createdFrom: parsed.data.createdFrom ? new Date(parsed.data.createdFrom) : undefined,
      createdTo: parsed.data.createdTo ? new Date(parsed.data.createdTo) : undefined,
      orderMonth: parsed.data.orderMonth,
    });
    return c.json(serialize(report));
  }

  const customers = await prisma.customer.findMany({
    where: {
      storeId,
      ...(loyaltyOnly ? { loyaltyEnrolled: true } : {}),
      ...(parsed.data.loyalty === "false" ? { loyaltyEnrolled: false } : {}),
      ...(parsed.data.search
        ? {
            OR: [
              { name: { contains: parsed.data.search, mode: "insensitive" } },
              { phone: { contains: parsed.data.search } },
              { email: { contains: parsed.data.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  const visible = fullDetails
    ? customers
    : customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        loyaltyEnrolled: customer.loyaltyEnrolled,
        loyaltyPoints: customer.loyaltyPoints,
      }));

  return c.json({ customers: serialize(visible) });
});

customerRoutes.post("/enroll", requireAuth, requireAnyPermission("pos.loyalty"), async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = enrollSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid loyalty payload", details: parsed.error.flatten() }, 400);
  }

  const phone = parsed.data.phone.trim();
  const now = new Date();

  if (parsed.data.customerId) {
    const existing = await prisma.customer.findFirst({
      where: { id: parsed.data.customerId, storeId },
    });
    if (!existing) {
      return c.json({ error: "Customer not found" }, 404);
    }
    const customer = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name.trim(),
        phone,
        email: parsed.data.email ?? existing.email,
        loyaltyEnrolled: true,
        loyaltyJoinedAt: existing.loyaltyJoinedAt ?? now,
      },
    });
    return c.json({ customer: serialize(customer) });
  }

  const byPhone = await prisma.customer.findFirst({
    where: {
      storeId,
      phone: { in: phoneCandidates(phone) },
    },
  });

  if (byPhone) {
    const customer = await prisma.customer.update({
      where: { id: byPhone.id },
      data: {
        name: parsed.data.name.trim(),
        phone,
        email: parsed.data.email ?? byPhone.email,
        loyaltyEnrolled: true,
        loyaltyJoinedAt: byPhone.loyaltyJoinedAt ?? now,
      },
    });
    return c.json({ customer: serialize(customer) });
  }

  const customer = await prisma.customer.create({
    data: {
      storeId,
      name: parsed.data.name.trim(),
      phone,
      email: parsed.data.email ?? null,
      loyaltyEnrolled: true,
      loyaltyJoinedAt: now,
    },
  });

  return c.json({ customer: serialize(customer) }, 201);
});

customerRoutes.post("/pos", requireAuth, requireAnyPermission("pos.sales"), async (c) => {
  const { storeId } = c.get("auth");
  const canManage = userHasPermission(c.get("permissions"), "customers.manage");
  const body = await c.req.json().catch(() => null);
  const parsed = posCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid customer payload", details: parsed.error.flatten() }, 400);
  }

  const phone = parsed.data.phone.trim();
  const name = parsed.data.name.trim();

  const byPhone = await prisma.customer.findFirst({
    where: {
      storeId,
      phone: { in: phoneCandidates(phone) },
    },
  });

  if (byPhone) {
    if (!canManage) {
      return c.json({ customer: serialize(byPhone) });
    }
    const customer = await prisma.customer.update({
      where: { id: byPhone.id },
      data: { name, phone },
    });
    return c.json({ customer: serialize(customer) });
  }

  const customer = await prisma.customer.create({
    data: {
      storeId,
      name,
      phone,
    },
  });

  return c.json({ customer: serialize(customer) }, 201);
});

customerRoutes.get(
  "/:id",
  requireAuth,
  requireAnyPermission("customers.view", "customers.manage"),
  async (c) => {
  const { storeId } = c.get("auth");

  const customer = await prisma.customer.findFirst({
    where: { id: c.req.param("id"), storeId },
  });

  if (!customer) {
    return c.json({ error: "Customer not found" }, 404);
  }

  return c.json({ customer: serialize(customer) });
});

customerRoutes.post("/", requireAuth, requireAnyPermission("customers.manage"), async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = createCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid customer payload", details: parsed.error.flatten() }, 400);
  }

  const customer = await prisma.customer.create({
    data: {
      storeId,
      name: parsed.data.name.trim(),
      email: parsed.data.email ?? null,
      phone: parsed.data.phone?.trim() || null,
      notes: parsed.data.notes ?? null,
      loyaltyEnrolled: parsed.data.loyaltyEnrolled ?? false,
      loyaltyJoinedAt: parsed.data.loyaltyEnrolled ? new Date() : null,
    },
  });

  return c.json({ customer: serialize(customer) }, 201);
});

customerRoutes.patch("/:id", requireAuth, requireAnyPermission("customers.manage"), async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = updateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid customer payload", details: parsed.error.flatten() }, 400);
  }

  const existing = await prisma.customer.findFirst({
    where: { id: c.req.param("id"), storeId },
  });

  if (!existing) {
    return c.json({ error: "Customer not found" }, 404);
  }

  const enrolling =
    parsed.data.loyaltyEnrolled === true && !existing.loyaltyEnrolled;

  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
      ...(parsed.data.phone !== undefined
        ? { phone: parsed.data.phone?.trim() || null }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.loyaltyEnrolled !== undefined
        ? { loyaltyEnrolled: parsed.data.loyaltyEnrolled }
        : {}),
      ...(enrolling ? { loyaltyJoinedAt: new Date() } : {}),
    },
  });

  return c.json({ customer: serialize(customer) });
});

customerRoutes.delete("/:id", requireAuth, requireAnyPermission("customers.manage"), async (c) => {
  const { storeId } = c.get("auth");

  const existing = await prisma.customer.findFirst({
    where: { id: c.req.param("id"), storeId },
  });

  if (!existing) {
    return c.json({ error: "Customer not found" }, 404);
  }

  await prisma.customer.delete({ where: { id: existing.id } });

  return c.json({ ok: true });
});
