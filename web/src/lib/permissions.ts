import type { PermissionKey, UserRole } from "./types";

export type { PermissionKey };
export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  group: string;
  detail?: boolean;
};

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: "dashboard.view", label: "View dashboard", group: "General" },
  { key: "pos.sales", label: "Regular sales", group: "POS" },
  { key: "pos.discount", label: "Invoice discount", group: "POS", detail: true },
  { key: "pos.price", label: "Change unit price", group: "POS", detail: true },
  { key: "pos.loyalty", label: "Loyalty program", group: "POS", detail: true },
  {
    key: "pos.payments.other",
    label: "Other payments (debit, breakage, delivery)",
    group: "POS",
    detail: true,
  },
  { key: "pos.projects", label: "Projects", group: "POS" },
  { key: "calendar.view", label: "View calendar", group: "Operations" },
  { key: "calendar.manage", label: "Edit calendar", group: "Operations", detail: true },
  { key: "orders.view", label: "View orders", group: "Operations" },
  { key: "orders.items", label: "Items sales report", group: "Operations", detail: true },
  { key: "orders.void", label: "Void orders", group: "Operations", detail: true },
  { key: "inventory.view", label: "View inventory", group: "Inventory" },
  { key: "inventory.manage", label: "Manage inventory", group: "Inventory", detail: true },
  { key: "products.view", label: "View products", group: "Inventory" },
  { key: "products.details", label: "Create item details", group: "Inventory", detail: true },
  { key: "products.price", label: "Set product prices", group: "Inventory", detail: true },
  { key: "products.manage", label: "Manage products", group: "Inventory", detail: true },
  { key: "categories.view", label: "View categories", group: "Inventory" },
  { key: "categories.manage", label: "Manage categories", group: "Inventory", detail: true },
  { key: "stock.view", label: "View stock history", group: "Inventory" },
  { key: "stock.adjust", label: "Adjust stock", group: "Inventory", detail: true },
  { key: "customers.view", label: "View customers", group: "Customers" },
  { key: "customers.manage", label: "Manage customers", group: "Customers", detail: true },
  { key: "staff.manage", label: "Manage staff", group: "Administration" },
  { key: "roles.manage", label: "Roles & policies", group: "Administration" },
  { key: "settings.manage", label: "Store settings", group: "Administration" },
  { key: "vendors.view", label: "View vendor balances", group: "Vendors" },
  { key: "vendors.record", label: "Record vendor invoices & payments", group: "Vendors" },
  { key: "vendors.manage", label: "Manage vendors ledger", group: "Vendors" },
];

/** Checking a feature also enables the page it belongs to. Turning the page off clears its features. */
const PERMISSION_REQUIRES: Partial<Record<PermissionKey, PermissionKey>> = {
  "pos.discount": "pos.sales",
  "pos.price": "pos.sales",
  "pos.loyalty": "pos.sales",
  "pos.payments.other": "pos.sales",
  "calendar.manage": "calendar.view",
  "orders.items": "orders.view",
  "orders.void": "orders.view",
  "inventory.manage": "inventory.view",
  "products.details": "products.view",
  "products.price": "products.view",
  "products.manage": "products.view",
  "categories.manage": "categories.view",
  "stock.adjust": "stock.view",
  "customers.manage": "customers.view",
};

export function applyPermissionToggle(
  current: PermissionKey[],
  key: PermissionKey,
  checked: boolean,
): PermissionKey[] {
  const next = new Set(current);
  if (checked) {
    next.add(key);
    const parent = PERMISSION_REQUIRES[key];
    if (parent) next.add(parent);
  } else {
    next.delete(key);
    for (const [child, parent] of Object.entries(PERMISSION_REQUIRES)) {
      if (parent === key) next.delete(child as PermissionKey);
    }
  }
  return [...next];
}

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
    "pos.discount",
    "pos.price",
    "pos.loyalty",
    "pos.payments.other",
    "orders.view",
    "orders.items",
    "calendar.view",
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
  "/calendar": ["calendar.view", "calendar.manage"],
  "/orders": ["orders.view", "pos.projects"],
  "/inventory": ["inventory.view", "inventory.manage"],
  "/admin/products": ["products.view", "products.details", "products.price", "products.manage"],
  "/admin/categories": ["categories.view", "categories.manage"],
  "/customers": ["customers.view", "customers.manage"],
  "/stock": ["stock.view", "stock.adjust"],
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
