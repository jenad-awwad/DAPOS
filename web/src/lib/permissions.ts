import type { PermissionKey, UserRole } from "./types";

export type { PermissionKey };
export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  group: string;
};

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: "dashboard.view", label: "View dashboard", group: "General" },
  { key: "pos.sales", label: "Regular sales", group: "POS" },
  { key: "pos.projects", label: "Projects", group: "POS" },
  { key: "calendar.manage", label: "Calendar", group: "Operations" },
  { key: "orders.view", label: "View orders", group: "Operations" },
  { key: "orders.void", label: "Void orders", group: "Operations" },
  { key: "inventory.view", label: "View inventory", group: "Inventory" },
  { key: "inventory.manage", label: "Manage inventory", group: "Inventory" },
  { key: "products.manage", label: "Manage products", group: "Inventory" },
  { key: "categories.manage", label: "Manage categories", group: "Inventory" },
  { key: "stock.view", label: "Stock history", group: "Inventory" },
  { key: "customers.manage", label: "Manage customers", group: "Customers" },
  { key: "staff.manage", label: "Manage staff", group: "Administration" },
  { key: "roles.manage", label: "Roles & policies", group: "Administration" },
  { key: "settings.manage", label: "Store settings", group: "Administration" },
  { key: "vendors.view", label: "View vendor balances", group: "Vendors" },
  { key: "vendors.record", label: "Record vendor invoices & payments", group: "Vendors" },
  { key: "vendors.manage", label: "Manage vendors ledger", group: "Vendors" },
];

export type RolePoliciesMap = Record<UserRole, PermissionKey[]>;

const ALL_PERMISSIONS = PERMISSION_CATALOG.map((item) => item.key);

export const DEFAULT_ROLE_POLICIES: RolePoliciesMap = {
  ADMIN: [...ALL_PERMISSIONS],
  MANAGER: ALL_PERMISSIONS.filter(
    (key) =>
      key !== "staff.manage" &&
      key !== "roles.manage" &&
      key !== "settings.manage",
  ),
  CASHIER: [
    "dashboard.view",
    "pos.sales",
    "orders.view",
    "calendar.manage",
    "vendors.record",
  ],
};

export const ROLE_SELECT_DATA = (
  ["CASHIER", "MANAGER", "ADMIN"] as UserRole[]
).map((role) => ({
  value: role,
  label: role === "ADMIN" ? "Administrator" : role === "MANAGER" ? "Manager" : "Cashier",
}));

export const NAV_PERMISSIONS: Record<string, PermissionKey | PermissionKey[]> = {
  "/": "dashboard.view",
  "/pos": ["pos.sales", "pos.projects"],
  "/calendar": "calendar.manage",
  "/orders": "orders.view",
  "/inventory": "inventory.view",
  "/admin/products": "products.manage",
  "/admin/categories": "categories.manage",
  "/customers": "customers.manage",
  "/stock": "stock.view",
  "/admin/staff": "staff.manage",
  "/admin/roles": "roles.manage",
  "/vendors": ["vendors.view", "vendors.record", "vendors.manage"],
  "/settings": "settings.manage",
};

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
    return !["staff.manage", "roles.manage", "settings.manage"].includes(permission);
  }
  if (permission === "vendors.record") return true;
  return ["dashboard.view", "pos.sales", "orders.view", "calendar.manage"].includes(
    permission,
  );
}

export function userCanAccess(
  user: { role: UserRole; permissions?: PermissionKey[] } | null | undefined,
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
