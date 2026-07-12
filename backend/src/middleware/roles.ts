import { UserRole } from "@prisma/client";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./auth.js";

export function requireRole(...roles: UserRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { role } = c.get("auth");
    if (!roles.includes(role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  });
}

export const requireManager = requireRole(UserRole.ADMIN, UserRole.MANAGER);

export const requireAdmin = requireRole(UserRole.ADMIN);
