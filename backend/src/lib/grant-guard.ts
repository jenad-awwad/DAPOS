import type { UserRole } from "@prisma/client";
import { AppError } from "./errors.js";
import type { PermissionKey } from "./permissions.js";

export const OWNER_ONLY_PERMISSIONS = [
  "staff.manage",
  "roles.manage",
  "settings.manage",
] as const satisfies readonly PermissionKey[];

export function assertCanGrant(
  editor: { role: UserRole; permissions: PermissionKey[] },
  next: { permissions: PermissionKey[]; role?: UserRole },
) {
  if (editor.role === "ADMIN") return;

  if (next.role === "ADMIN") {
    throw new AppError("You can't grant admin access", 403);
  }

  for (const key of next.permissions) {
    if ((OWNER_ONLY_PERMISSIONS as readonly string[]).includes(key)) {
      throw new AppError("You can't grant that permission", 403);
    }
    if (!editor.permissions.includes(key)) {
      throw new AppError("You can't grant a permission you don't hold", 403);
    }
  }
}
