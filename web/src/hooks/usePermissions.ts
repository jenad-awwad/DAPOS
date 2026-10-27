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
  const products = useHasPermission("products.manage");
  const inventory = useHasPermission("inventory.manage");
  const customers = useHasPermission("customers.manage");
  return products || inventory || customers;
}

export function useIsAdmin() {
  return useHasPermission("staff.manage");
}
