import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { serialize } from "../lib/serialize.js";
import {
  DEFAULT_ROLE_POLICIES,
  PERMISSION_CATALOG,
  isPermissionKey,
  sanitizeRolePolicies,
  type PermissionKey,
  type RolePoliciesMap,
} from "../lib/permissions.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/roles.js";

const permissionSchema = z.string().refine(isPermissionKey, {
  message: "Invalid permission key",
});

const rolePoliciesSchema = z.object({
  ADMIN: z.array(permissionSchema),
  MANAGER: z.array(permissionSchema),
  CASHIER: z.array(permissionSchema),
});

export const accessRoutes = new Hono<AppEnv>();

accessRoutes.use("*", requireAuth, requireAdmin);

accessRoutes.get("/catalog", (c) => {
  return c.json({ permissions: PERMISSION_CATALOG });
});

accessRoutes.get("/role-policies", async (c) => {
  const auth = c.get("auth");
  const store = await prisma.store.findFirst({
    where: { id: auth.storeId, isActive: true },
    select: { rolePolicies: true },
  });

  if (!store) {
    return c.json({ error: "Store not found" }, 404);
  }

  const policies = sanitizeRolePolicies(store.rolePolicies);
  return c.json({
    policies: serialize(policies),
    defaults: serialize(DEFAULT_ROLE_POLICIES),
  });
});

accessRoutes.patch("/role-policies", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = rolePoliciesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid role policies payload" }, 400);
  }

  const policies: RolePoliciesMap = parsed.data;

  const store = await prisma.store.update({
    where: { id: auth.storeId },
    data: { rolePolicies: policies },
    select: { rolePolicies: true },
  });

  return c.json({ policies: serialize(sanitizeRolePolicies(store.rolePolicies)) });
});
