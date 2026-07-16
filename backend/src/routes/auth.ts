import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { phoneCandidates } from "../lib/phone.js";
import { resolveUserPermissions } from "../lib/permissions.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";

const loginSchema = z.object({
  phone: z.string().min(7).max(20),
  pin: z.string().min(4).max(6),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Phone and PIN are required" }, 400);
  }

  const { pin } = parsed.data;

  const user = await prisma.user.findFirst({
    where: {
      phone: { in: phoneCandidates(parsed.data.phone) },
      pin,
      isActive: true,
      store: { isActive: true },
    },
    include: { store: true },
  });

  if (!user) {
    return c.json({ error: "Invalid phone or PIN" }, 401);
  }

  const token = await signToken({
    sub: user.id,
    storeId: user.storeId,
    role: user.role,
  });

  const permissions = resolveUserPermissions(
    user.role,
    user.customPolicies,
    user.store.rolePolicies,
  );

  return c.json({
    token,
    user: serialize({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      storeId: user.storeId,
      permissions,
    }),
    store: serialize({
      id: user.store.id,
      name: user.store.name,
      currency: user.store.currency,
      taxRate: user.store.taxRate,
    }),
  });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const auth = c.get("auth");

  const user = await prisma.user.findFirst({
    where: { id: auth.sub, storeId: auth.storeId, isActive: true },
    include: { store: true },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const permissions = resolveUserPermissions(
    user.role,
    user.customPolicies,
    user.store.rolePolicies,
  );

  return c.json({
    user: serialize({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      storeId: user.storeId,
      permissions,
    }),
    store: serialize({
      id: user.store.id,
      name: user.store.name,
      currency: user.store.currency,
      taxRate: user.store.taxRate,
    }),
  });
});
