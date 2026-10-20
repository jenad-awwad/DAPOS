import type { PermissionKey, User, UserRole } from "./types";

export function permissionMatches(
  permissions: PermissionKey[] | undefined,
  required: PermissionKey | PermissionKey[],
): boolean {
  if (!permissions?.length) return false;
  const keys = Array.isArray(required) ? required : [required];
  return keys.some((key) => permissions.includes(key));
}

function roleFallback(role: UserRole, permission: PermissionKey): boolean {
  if (role === "ADMIN") return true;
  if (role === "MANAGER") {
    return !["staff.manage", "roles.manage", "settings.manage"].includes(
      permission,
    );
  }
  if (permission === "vendors.record") return true;
  return [
    "dashboard.view",
    "pos.sales",
    "pos.discount",
    "pos.price",
    "pos.loyalty",
    "pos.payments.other",
    "orders.view",
    "orders.items",
    "calendar.view",
    "calendar.manage",
  ].includes(permission);
}

export function userCanAccess(
  user: Pick<User, "role" | "permissions"> | null | undefined,
  required: PermissionKey | PermissionKey[],
): boolean {
  if (!user) return false;
  const keys = Array.isArray(required) ? required : [required];
  if (user.permissions?.length) {
    if (permissionMatches(user.permissions, required)) return true;
    const vendorKeys = keys.filter((key) => key.startsWith("vendors."));
    const savedHasVendors = user.permissions.some((key) =>
      key.startsWith("vendors."),
    );
    if (vendorKeys.length > 0 && !savedHasVendors) {
      return vendorKeys.some((key) => roleFallback(user.role, key));
    }
    return false;
  }
  return keys.some((key) => roleFallback(user.role, key));
}
