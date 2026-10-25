import type { UserRole } from "@prisma/client";

/** Stored beside permission keys once an administrator saves a role on the new catalog. */
export const PERMISSION_REVISION = "_v3";
const PREVIOUS_PERMISSION_REVISION = "_v2";

export const PERMISSION_KEYS = [
  "dashboard.view",
  "pos.sales",
  "pos.discount",
  "pos.price",
  "pos.loyalty",
  "pos.payments.other",
  "pos.projects",
  "calendar.view",
  "calendar.manage",
  "orders.view",
  "orders.items",
  "orders.void",
  "inventory.view",
  "inventory.manage",
  "products.view",
  "products.details",
  "products.price",
  "products.manage",
  "categories.view",
  "categories.manage",
  "customers.view",
  "customers.manage",
  "stock.view",
  "stock.adjust",
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
  /** Feature or edit row that belongs to the page permission above it. */
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

export type RolePoliciesMap = Record<UserRole, PermissionKey[]>;

/** Child permission -> page permission it needs. */
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

const POS_FEATURE_KEYS: PermissionKey[] = [
  "pos.discount",
  "pos.price",
  "pos.loyalty",
  "pos.payments.other",
];

const VENDOR_PERMISSION_KEYS: PermissionKey[] = [
  "vendors.view",
  "vendors.record",
  "vendors.manage",
];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export function readStoredPermissions(value: unknown): {
  keys: PermissionKey[];
  configured: boolean;
  revision?: string;
} | null {
  if (value == null || !Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string");
  const revision = strings.includes(PERMISSION_REVISION)
    ? PERMISSION_REVISION
    : strings.includes(PREVIOUS_PERMISSION_REVISION)
      ? PREVIOUS_PERMISSION_REVISION
      : undefined;
  return {
    configured: revision === PERMISSION_REVISION,
    keys: strings.filter(isPermissionKey),
    revision,
  };
}

export function implyDependencies(permissions: PermissionKey[]): PermissionKey[] {
  const next = new Set(permissions);
  for (const key of permissions) {
    const parent = PERMISSION_REQUIRES[key];
    if (parent) next.add(parent);
  }
  return [...next];
}

function expandLegacy(role: UserRole | null, keys: PermissionKey[]): PermissionKey[] {
  const next = new Set(keys);

  if (next.has("pos.sales")) {
    for (const key of POS_FEATURE_KEYS) next.add(key);
  }
  if (next.has("orders.view")) next.add("orders.items");
  if (next.has("calendar.manage")) next.add("calendar.view");
  if (next.has("products.manage")) {
    next.add("products.view");
    next.add("products.details");
    next.add("products.price");
  }
  if (next.has("categories.manage")) next.add("categories.view");
  if (next.has("customers.manage")) next.add("customers.view");
  if (next.has("inventory.manage")) next.add("inventory.view");

  // Stock adjustments used to follow any manage permission on these pages.
  if (
    next.has("inventory.manage") ||
    next.has("products.manage") ||
    next.has("customers.manage")
  ) {
    next.add("stock.view");
    next.add("stock.adjust");
  }

  if (role) {
    const withVendors = withVendorPermissionDefaults(role, [...next]);
    for (const key of withVendors) next.add(key);
  }

  return implyDependencies([...next]);
}

export function parsePermissionList(
  value: unknown,
  role?: UserRole | null,
): PermissionKey[] | null {
  const stored = readStoredPermissions(value);
  if (!stored) return null;
  if (stored.configured) return implyDependencies(stored.keys);
  if (stored.revision === PREVIOUS_PERMISSION_REVISION) {
    const next = new Set(stored.keys);
    if (next.has("products.manage")) {
      next.add("products.details");
      next.add("products.price");
      next.add("products.view");
    }
    return implyDependencies([...next]);
  }
  return expandLegacy(role ?? null, stored.keys);
}

export function stampPermissionList(permissions: PermissionKey[]): string[] {
  return [...implyDependencies(permissions), PERMISSION_REVISION];
}

export function sanitizeRolePolicies(input: unknown): RolePoliciesMap {
  const defaults = { ...DEFAULT_ROLE_POLICIES };
  if (!input || typeof input !== "object") return defaults;

  const record = input as Record<string, unknown>;
  const roles: UserRole[] = ["ADMIN", "MANAGER", "CASHIER"];

  return roles.reduce((acc, role) => {
    const list = parsePermissionList(record[role], role);
    acc[role] = list && list.length > 0 ? list : defaults[role];
    return acc;
  }, { ...defaults });
}

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
  const custom = parsePermissionList(customPolicies, role);
  if (custom && custom.length > 0) return custom;

  const fromStoreRole = parsePermissionList(storeRolePermissions, role);
  if (fromStoreRole && fromStoreRole.length > 0) return fromStoreRole;

  const policies = sanitizeRolePolicies(storeRolePolicies);
  return policies[role] ?? DEFAULT_ROLE_POLICIES[role];
}

export function userHasPermission(
  permissions: PermissionKey[],
  required: PermissionKey,
): boolean {
  return permissions.includes(required);
}
