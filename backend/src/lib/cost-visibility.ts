import { userHasPermission, type PermissionKey } from "./permissions.js";

/** Product cost is confidential to users who can set prices or manage products. */
export function canViewCost(permissions: PermissionKey[]): boolean {
  return (
    userHasPermission(permissions, "products.price") ||
    userHasPermission(permissions, "products.manage")
  );
}

/** Returns the serialized product with `cost` cleared unless the caller may see it. */
export function withCostVisibility<T extends { cost?: unknown }>(
  product: T,
  showCost: boolean,
): T {
  if (showCost) return product;
  return { ...product, cost: null } as T;
}
