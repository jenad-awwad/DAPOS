import { Currency } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../lib/audit.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";

const updateStoreSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  currency: z.nativeEnum(Currency).optional(),
  taxRate: z.number().min(0).max(1).optional(),
});

export const storeRoutes = new Hono<AppEnv>();

storeRoutes.get("/", requireAuth, async (c) => {
  const { storeId } = c.get("auth");

  const store = await prisma.store.findFirst({
    where: { id: storeId, isActive: true },
  });

  if (!store) {
    return c.json({ error: "Store not found" }, 404);
  }

  return c.json({
    store: serialize(store),
    currencies: Object.values(Currency),
  });
});

storeRoutes.patch("/", requireAuth, requireAnyPermission("settings.manage"), async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = updateStoreSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid store payload", details: parsed.error.flatten() }, 400);
  }

  const store = await prisma.$transaction(async (tx) => {
    const updated = await tx.store.update({
      where: { id: storeId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
        ...(parsed.data.taxRate !== undefined ? { taxRate: parsed.data.taxRate } : {}),
      },
    });
    await recordAudit(tx, {
      storeId,
      actorId: c.get("auth").sub,
      action: "store.settings",
      entityType: "store",
      entityId: storeId,
      details: parsed.data,
    });
    return updated;
  });

  return c.json({
    store: serialize(store),
    currencies: Object.values(Currency),
  });
});
