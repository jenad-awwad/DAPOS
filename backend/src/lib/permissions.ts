import type { UserRole } from "@prisma/client";

export const PERMISSION_KEYS = [
  "dashboard.view",
  "pos.sales",
  "pos.projects",
  "calendar.manage",
  "orders.view",
  "orders.void",
  "inventory.view",
  "inventory.manage",
  "products.manage",
  "categories.manage",
  "customers.manage",
  "stock.view",
  "staff.manage",
  "roles.manage",
  "settings.manage",
  "vendors.view",
  "vendors.record",
  "vendors.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

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

const ALL_PERMISSIONS: PermissionKey[] = [...PERMISSION_KEYS];

export const DEFAULT_ROLE_POLICIES: Record<UserRole, PermissionKey[]> = {
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

export type RolePoliciesMap = Record<UserRole, PermissionKey[]>;

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export function parsePermissionList(value: unknown): PermissionKey[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const parsed = value.filter(
    (item): item is PermissionKey =>
      typeof item === "string" && isPermissionKey(item),
  );
  return parsed;
}

export function sanitizeRolePolicies(
  input: unknown,
): RolePoliciesMap {
  const defaults = { ...DEFAULT_ROLE_POLICIES };
  if (!input || typeof input !== "object") return defaults;

  const record = input as Record<string, unknown>;
  const roles: UserRole[] = ["ADMIN", "MANAGER", "CASHIER"];

  return roles.reduce((acc, role) => {
    const list = parsePermissionList(record[role]);
    acc[role] = list && list.length > 0 ? list : defaults[role];
    return acc;
  }, { ...defaults });
}

const VENDOR_PERMISSION_KEYS: PermissionKey[] = [
  "vendors.view",
  "vendors.record",
  "vendors.manage",
];

/** Older saved role lists predate Vendors; grant the role's default vendor keys until they are configured. */
export function withVendorPermissionDefaults(
  role: UserRole,
  permissions: PermissionKey[],
): PermissionKey[] {
  const hasVendorKey = permissions.some((key) =>
    VENDOR_PERMISSION_KEYS.includes(key),
  );
  if (hasVendorKey) return permissions;
  const extras = DEFAULT_ROLE_POLICIES[role].filter((key) =>
    VENDOR_PERMISSION_KEYS.includes(key),
  );
  return extras.length ? [...permissions, ...extras] : permissions;
}

export function resolveUserPermissions(
  role: UserRole,
  customPolicies: unknown,
  storeRolePolicies: unknown,
  storeRolePermissions?: unknown,
): PermissionKey[] {
  const custom = parsePermissionList(customPolicies);
  if (custom && custom.length > 0) {
    return withVendorPermissionDefaults(role, custom);
  }

  const fromStoreRole = parsePermissionList(storeRolePermissions);
  if (fromStoreRole && fromStoreRole.length > 0) {
    return withVendorPermissionDefaults(role, fromStoreRole);
  }

  const policies = sanitizeRolePolicies(storeRolePolicies);
  return withVendorPermissionDefaults(
    role,
    policies[role] ?? DEFAULT_ROLE_POLICIES[role],
  );
}

export function userHasPermission(
  permissions: PermissionKey[],
  required: PermissionKey,
): boolean {
  return permissions.includes(required);
}
