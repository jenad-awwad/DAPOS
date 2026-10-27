import { createMiddleware } from "hono/factory";
import type { UserRole } from "@prisma/client";
import { verifyToken, type AuthPayload } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { resolveUserPermissions, type PermissionKey } from "../lib/permissions.js";

export type AppEnv = {
  Variables: {
    auth: AuthPayload;
    permissions: PermissionKey[];
    role: UserRole;
    storeRoleId: string | null;
  };
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let auth: AuthPayload;
  try {
    auth = await verifyToken(header.slice(7));
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const user = await prisma.user.findFirst({
    where: {
      id: auth.sub,
      storeId: auth.storeId,
      isActive: true,
      store: { isActive: true },
    },
    include: { store: true, storeRole: true },
  });

  if (!user || user.tokenVersion !== auth.tokenVersion) {
    return c.json({ error: "Session expired. Please log in again." }, 401);
  }

  const permissions = resolveUserPermissions(
    user.role,
    user.customPolicies,
    user.store.rolePolicies,
    user.storeRole?.permissions,
  );

  c.set("auth", { ...auth, role: user.role, tokenVersion: user.tokenVersion });
  c.set("permissions", permissions);
  c.set("role", user.role);
  c.set("storeRoleId", user.storeRoleId);
  await next();
});
