import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { phoneCandidates } from "../lib/phone.js";
import { resolveUserPermissions } from "../lib/permissions.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { ensureStoreRoles } from "../services/store-roles.js";

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
    include: { store: true, storeRole: true },
  });

  if (!user) {
    return c.json({ error: "Invalid phone or PIN" }, 401);
  }

  const token = await signToken({
    sub: user.id,
    storeId: user.storeId,
    role: user.role,
  });

  await ensureStoreRoles(user.storeId);
  const refreshed = await prisma.user.findFirstOrThrow({
    where: { id: user.id },
    include: { store: true, storeRole: true },
  });

  const permissions = resolveUserPermissions(
    refreshed.role,
    refreshed.customPolicies,
    refreshed.store.rolePolicies,
    refreshed.storeRole?.permissions,
  );

  return c.json({
    token,
    user: serialize({
      id: refreshed.id,
      name: refreshed.name,
      phone: refreshed.phone,
      role: refreshed.role,
      storeRoleId: refreshed.storeRoleId,
      storeRoleName: refreshed.storeRole?.name ?? null,
      storeId: refreshed.storeId,
      permissions,
    }),
    store: serialize({
      id: refreshed.store.id,
      name: refreshed.store.name,
      currency: refreshed.store.currency,
      taxRate: refreshed.store.taxRate,
    }),
  });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const auth = c.get("auth");

  const user = await prisma.user.findFirst({
    where: { id: auth.sub, storeId: auth.storeId, isActive: true },
    include: { store: true, storeRole: true },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await ensureStoreRoles(user.storeId);
  const refreshed = await prisma.user.findFirstOrThrow({
    where: { id: user.id },
    include: { store: true, storeRole: true },
  });

  const permissions = resolveUserPermissions(
    refreshed.role,
    refreshed.customPolicies,
    refreshed.store.rolePolicies,
    refreshed.storeRole?.permissions,
  );

  return c.json({
    user: serialize({
      id: refreshed.id,
      name: refreshed.name,
      phone: refreshed.phone,
      role: refreshed.role,
      storeRoleId: refreshed.storeRoleId,
      storeRoleName: refreshed.storeRole?.name ?? null,
      storeId: refreshed.storeId,
      permissions,
    }),
    store: serialize({
      id: refreshed.store.id,
      name: refreshed.store.name,
      currency: refreshed.store.currency,
      taxRate: refreshed.store.taxRate,
    }),
  });
});
