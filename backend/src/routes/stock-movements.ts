import { Hono } from "hono";
import { z } from "zod";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireManager } from "../middleware/roles.js";
import { adjustStock, listStockMovements } from "../services/inventory.js";

const adjustSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().refine((v) => v !== 0, "Quantity cannot be zero"),
  type: z.enum(["RESTOCK", "ADJUSTMENT"]),
  reason: z.string().max(500).optional(),
});

export const stockMovementRoutes = new Hono<AppEnv>();

stockMovementRoutes.get("/", requireAuth, async (c) => {
  const { storeId } = c.get("auth");
  const productId = c.req.query("productId");
  const limit = Number(c.req.query("limit") ?? "100");

  const movements = await listStockMovements(storeId, {
    productId: productId || undefined,
    limit: Number.isFinite(limit) ? limit : 100,
  });

  return c.json({ movements: serialize(movements) });
});

stockMovementRoutes.post("/adjust", requireAuth, requireManager, async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = adjustSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid adjustment payload", details: parsed.error.flatten() }, 400);
  }

  try {
    const movement = await adjustStock({
      storeId: auth.storeId,
      productId: parsed.data.productId,
      userId: auth.sub,
      quantity: parsed.data.quantity,
      type: parsed.data.type,
      reason: parsed.data.reason,
    });
    return c.json({ movement: serialize(movement) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not adjust stock";
    return c.json({ error: message }, 400);
  }
});
