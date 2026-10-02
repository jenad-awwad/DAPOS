import { createMiddleware } from "hono/factory";
import { prisma } from "../lib/prisma.js";
import {
  resolveUserPermissions,
  userHasPermission,
  type PermissionKey,
} from "../lib/permissions.js";
import type { AppEnv } from "./auth.js";

export async function loadUserPermissions(
  storeId: string,
  userId: string,
): Promise<PermissionKey[]> {
  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true },
    include: { store: true, storeRole: true },
  });

  if (!user) return [];

  return resolveUserPermissions(
    user.role,
    user.customPolicies,
    user.store.rolePolicies,
    user.storeRole?.permissions,
  );
}

export function requireAnyPermission(...required: PermissionKey[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const auth = c.get("auth");
    const permissions = await loadUserPermissions(auth.storeId, auth.sub);

    const allowed = required.some((key) =>
      userHasPermission(permissions, key),
    );

    if (!allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  });
}
