import { Hono } from "hono";
import { z } from "zod";
import { serialize } from "../lib/serialize.js";
import {
  PERMISSION_CATALOG,
  DEFAULT_ROLE_POLICIES,
  isPermissionKey,
  sanitizeRolePolicies,
  type PermissionKey,
  type RolePoliciesMap,
} from "../lib/permissions.js";
import { prisma } from "../lib/prisma.js";
import {
  createStoreRole,
  deleteStoreRole,
  ensureStoreRoles,
  listStoreRoles,
  updateStoreRole,
} from "../services/store-roles.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";

const permissionSchema = z.string().refine(isPermissionKey, {
  message: "Invalid permission key",
});

const rolePoliciesSchema = z.object({
  ADMIN: z.array(permissionSchema),
  MANAGER: z.array(permissionSchema),
  CASHIER: z.array(permissionSchema),
});

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  permissions: z.array(permissionSchema),
});

const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  permissions: z.array(permissionSchema).optional(),
});

export const accessRoutes = new Hono<AppEnv>();

accessRoutes.use("*", requireAuth, requireAnyPermission("roles.manage"));

accessRoutes.get("/catalog", (c) => {
  return c.json({ permissions: PERMISSION_CATALOG });
});

accessRoutes.get("/roles", async (c) => {
  const auth = c.get("auth");
  const roles = await listStoreRoles(auth.storeId);
  return c.json({ roles: serialize(roles) });
});

accessRoutes.post("/roles", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = createRoleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid role payload", details: parsed.error.flatten() }, 400);
  }

  try {
    const role = await createStoreRole(auth.storeId, parsed.data);
    return c.json({ role: serialize(role) }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Could not create role" },
      400,
    );
  }
});

accessRoutes.patch("/roles/:id", async (c) => {
  const auth = c.get("auth");
  const roleId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateRoleSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid role payload", details: parsed.error.flatten() }, 400);
  }

  try {
    const role = await updateStoreRole(auth.storeId, roleId, parsed.data);
    return c.json({ role: serialize(role) });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Could not update role" },
      400,
    );
  }
});

accessRoutes.delete("/roles/:id", async (c) => {
  const auth = c.get("auth");
  const roleId = c.req.param("id");

  try {
    await deleteStoreRole(auth.storeId, roleId);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Could not delete role" },
      400,
    );
  }
});

accessRoutes.get("/role-policies", async (c) => {
  const auth = c.get("auth");
  const roles = await ensureStoreRoles(auth.storeId);

  const policies = roles.reduce((acc, role) => {
    if (role.systemCode) {
      acc[role.systemCode] = role.permissions;
    }
    return acc;
  }, {} as RolePoliciesMap);

  const fullPolicies = sanitizeRolePolicies(policies);

  return c.json({
    roles: serialize(roles),
    policies: serialize(fullPolicies),
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

  await prisma.store.update({
    where: { id: auth.storeId },
    data: { rolePolicies: policies },
  });

  const roles = await ensureStoreRoles(auth.storeId);

  for (const role of roles) {
    if (!role.systemCode) continue;
    const permissions = policies[role.systemCode];
    if (!permissions) continue;
    await updateStoreRole(auth.storeId, role.id, { permissions });
  }

  const updatedRoles = await listStoreRoles(auth.storeId);

  return c.json({
    roles: serialize(updatedRoles),
    policies: serialize(sanitizeRolePolicies(policies)),
  });
});
