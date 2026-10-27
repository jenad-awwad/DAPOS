import { Hono, type Context } from "hono";
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
import { AppError, errorResponse } from "../lib/errors.js";
import { assertCanGrant } from "../lib/grant-guard.js";
import { recordAudit } from "../lib/audit.js";
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

async function guardRoleEdit(
  c: Context<AppEnv>,
  storeId: string,
  roleId: string,
  nextPermissions?: PermissionKey[],
) {
  const editorRole = c.get("role");
  const role = await prisma.storeRole.findFirst({ where: { id: roleId, storeId } });
  if (!role) throw new AppError("Role not found", 404);
  if (editorRole === "ADMIN") return role;
  if (role.systemCode === "ADMIN") {
    throw new AppError("You can't edit the admin role", 403);
  }
  if (role.id === c.get("storeRoleId")) {
    throw new AppError("You can't edit your own role", 403);
  }
  if (nextPermissions) {
    assertCanGrant(
      { role: editorRole, permissions: c.get("permissions") },
      { permissions: nextPermissions },
    );
  }
  return role;
}

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
    if (c.get("role") !== "ADMIN") {
      assertCanGrant(
        { role: c.get("role"), permissions: c.get("permissions") },
        { permissions: parsed.data.permissions },
      );
    }
    const role = await createStoreRole(auth.storeId, parsed.data, auth.sub);
    return c.json({ role: serialize(role) }, 201);
  } catch (error) {
    return errorResponse(c, error, "Could not create role");
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
    await guardRoleEdit(c, auth.storeId, roleId, parsed.data.permissions);
    const role = await updateStoreRole(auth.storeId, roleId, parsed.data, auth.sub);
    return c.json({ role: serialize(role) });
  } catch (error) {
    return errorResponse(c, error, "Could not update role");
  }
});

accessRoutes.delete("/roles/:id", async (c) => {
  const auth = c.get("auth");
  const roleId = c.req.param("id");

  try {
    await guardRoleEdit(c, auth.storeId, roleId);
    await deleteStoreRole(auth.storeId, roleId, auth.sub);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(c, error, "Could not delete role");
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

  if (c.get("role") !== "ADMIN") {
    const editorRoleId = c.get("storeRoleId");
    const roles = await ensureStoreRoles(auth.storeId);
    const sameList = (left: PermissionKey[], right: PermissionKey[]) =>
      left.length === right.length && left.every((key) => right.includes(key));
    for (const systemCode of ["ADMIN", "MANAGER", "CASHIER"] as const) {
      const permissions = policies[systemCode];
      const role = roles.find((item) => item.systemCode === systemCode);
      const unchanged = role ? sameList(role.permissions, permissions) : false;
      if (systemCode === "ADMIN" && !unchanged) {
        return c.json({ error: "You can't edit the admin role" }, 403);
      }
      if (role && role.id === editorRoleId && !unchanged) {
        return c.json({ error: "You can't edit your own role" }, 403);
      }
      if (!unchanged) {
        assertCanGrant(
          { role: c.get("role"), permissions: c.get("permissions") },
          { permissions },
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.store.update({
      where: { id: auth.storeId },
      data: { rolePolicies: policies },
    });
    await recordAudit(tx, {
      storeId: auth.storeId,
      actorId: auth.sub,
      action: "role_policies.update",
      entityType: "store",
      entityId: auth.storeId,
    });
  });

  const roles = await ensureStoreRoles(auth.storeId);

  for (const role of roles) {
    if (!role.systemCode) continue;
    const permissions = policies[role.systemCode];
    if (!permissions) continue;
    await updateStoreRole(auth.storeId, role.id, { permissions }, auth.sub);
  }

  const updatedRoles = await listStoreRoles(auth.storeId);

  return c.json({
    roles: serialize(updatedRoles),
    policies: serialize(sanitizeRolePolicies(policies)),
  });
});
