import { useAuth } from "../context/AuthContext";
import { userCanAccess } from "../lib/permissions";
import type { PermissionKey } from "../lib/types";

export function usePermissions() {
  const { user } = useAuth();
  return user?.permissions ?? [];
}

export function useHasPermission(permission: PermissionKey | PermissionKey[]) {
  const { user } = useAuth();
  return userCanAccess(user, permission);
}

export function useCanManage() {
  return (
    useHasPermission("products.manage") ||
    useHasPermission("inventory.manage") ||
    useHasPermission("customers.manage")
  );
}

export function useIsAdmin() {
  return useHasPermission("staff.manage");
}
