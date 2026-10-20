import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  DEFAULT_ROLE_POLICIES,
  parsePermissionList,
  readStoredPermissions,
  sanitizeRolePolicies,
  stampPermissionList,
  withVendorPermissionDefaults,
  type PermissionKey,
} from "../lib/permissions.js";

const SYSTEM_ROLE_NAMES: Record<UserRole, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

const SYSTEM_ROLES: UserRole[] = ["ADMIN", "MANAGER", "CASHIER"];

export type StoreRoleRecord = {
  id: string;
  storeId: string;
  name: string;
  isSystem: boolean;
  systemCode: UserRole | null;
  permissions: PermissionKey[];
  createdAt: Date;
  updatedAt: Date;
};

function serializeStoreRole(role: {
  id: string;
  storeId: string;
  name: string;
  isSystem: boolean;
  systemCode: UserRole | null;
  permissions: unknown;
  createdAt: Date;
  updatedAt: Date;
}): StoreRoleRecord {
  const permissions =
    parsePermissionList(role.permissions, role.systemCode) ??
    (role.systemCode ? DEFAULT_ROLE_POLICIES[role.systemCode] : []);

  return {
    id: role.id,
    storeId: role.storeId,
    name: role.name,
    isSystem: role.isSystem,
    systemCode: role.systemCode,
    permissions,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/** Ensure built-in roles exist and users are linked. Idempotent. */
export async function ensureStoreRoles(storeId: string): Promise<StoreRoleRecord[]> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { rolePolicies: true },
  });

  if (!store) {
    throw new Error("Store not found");
  }

  const policies = sanitizeRolePolicies(store.rolePolicies);
  const existing = await prisma.storeRole.findMany({
    where: { storeId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  const bySystemCode = new Map(
    existing
      .filter((role) => role.systemCode)
      .map((role) => [role.systemCode!, role]),
  );

  for (const systemCode of SYSTEM_ROLES) {
    if (bySystemCode.has(systemCode)) continue;

    await prisma.storeRole.create({
      data: {
        storeId,
        name: SYSTEM_ROLE_NAMES[systemCode],
        isSystem: true,
        systemCode,
        permissions: stampPermissionList(policies[systemCode]),
      },
    });
  }

  let roles = await prisma.storeRole.findMany({
    where: { storeId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  for (const role of roles) {
    if (!role.systemCode) continue;
    const stored = readStoredPermissions(role.permissions);
    if (stored?.configured) continue;
    const current = stored?.keys ?? DEFAULT_ROLE_POLICIES[role.systemCode];
    const next = withVendorPermissionDefaults(role.systemCode, current);
    if (next.length === current.length && next.every((key) => current.includes(key))) {
      continue;
    }
    await prisma.storeRole.update({
      where: { id: role.id },
      data: { permissions: next },
    });
  }

  roles = await prisma.storeRole.findMany({
    where: { storeId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  const roleBySystemCode = new Map(
    roles
      .filter((role) => role.systemCode)
      .map((role) => [role.systemCode!, role]),
  );

  const users = await prisma.user.findMany({
    where: { storeId, storeRoleId: null },
    select: { id: true, role: true },
  });

  for (const user of users) {
    const storeRole = roleBySystemCode.get(user.role);
    if (!storeRole) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { storeRoleId: storeRole.id },
    });
  }

  return roles.map(serializeStoreRole);
}

export async function listStoreRoles(storeId: string): Promise<StoreRoleRecord[]> {
  const roles = await ensureStoreRoles(storeId);
  return roles;
}

export async function createStoreRole(
  storeId: string,
  input: { name: string; permissions: PermissionKey[] },
): Promise<StoreRoleRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Role name is required");
  }

  const existing = await prisma.storeRole.findFirst({
    where: { storeId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    throw new Error("A role with this name already exists");
  }

  const role = await prisma.storeRole.create({
    data: {
      storeId,
      name,
      isSystem: false,
      permissions: stampPermissionList(input.permissions),
    },
  });

  return serializeStoreRole(role);
}

export async function updateStoreRole(
  storeId: string,
  roleId: string,
  input: { name?: string; permissions?: PermissionKey[] },
): Promise<StoreRoleRecord> {
  const existing = await prisma.storeRole.findFirst({
    where: { id: roleId, storeId },
  });

  if (!existing) {
    throw new Error("Role not found");
  }

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Role name is required");
    }

    const conflict = await prisma.storeRole.findFirst({
      where: {
        storeId,
        id: { not: roleId },
        name: { equals: name, mode: "insensitive" },
      },
    });
    if (conflict) {
      throw new Error("A role with this name already exists");
    }
  }

  const role = await prisma.storeRole.update({
    where: { id: roleId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.permissions !== undefined
        ? {
            permissions: stampPermissionList(
              existing.systemCode === "ADMIN"
                ? [...new Set([...input.permissions, "roles.manage" as const])]
                : input.permissions,
            ),
          }
        : {}),
    },
  });

  if (existing.isSystem && existing.systemCode && input.permissions !== undefined) {
    const saved =
      existing.systemCode === "ADMIN"
        ? [...new Set<PermissionKey>([...input.permissions, "roles.manage"])]
        : input.permissions;
    const currentPolicies = (
      await prisma.store.findUnique({
        where: { id: storeId },
        select: { rolePolicies: true },
      })
    )?.rolePolicies;
    const record =
      currentPolicies &&
      typeof currentPolicies === "object" &&
      !Array.isArray(currentPolicies)
        ? { ...(currentPolicies as Record<string, unknown>) }
        : { ...sanitizeRolePolicies(null) };
    record[existing.systemCode] = stampPermissionList(saved);
    await prisma.store.update({
      where: { id: storeId },
      data: { rolePolicies: record as Prisma.InputJsonValue },
    });
  }

  return serializeStoreRole(role);
}

export async function deleteStoreRole(storeId: string, roleId: string): Promise<void> {
  const role = await prisma.storeRole.findFirst({
    where: { id: roleId, storeId },
    include: { _count: { select: { users: true } } },
  });

  if (!role) {
    throw new Error("Role not found");
  }

  if (role.isSystem) {
    throw new Error("System roles cannot be deleted");
  }

  if (role._count.users > 0) {
    throw new Error("Cannot delete a role that is assigned to users");
  }

  await prisma.storeRole.delete({ where: { id: roleId } });
}

export async function getStoreRoleById(storeId: string, roleId: string) {
  const role = await prisma.storeRole.findFirst({
    where: { id: roleId, storeId },
  });
  return role ? serializeStoreRole(role) : null;
}

export function syncUserRoleEnum(
  systemCode: UserRole | null,
  permissions: PermissionKey[],
): UserRole {
  if (systemCode) return systemCode;

  if (permissions.includes("staff.manage") || permissions.includes("roles.manage")) {
    return "ADMIN";
  }

  if (
    permissions.some((key) =>
      [
        "products.manage",
        "categories.manage",
        "customers.manage",
        "inventory.manage",
        "orders.void",
        "settings.manage",
      ].includes(key),
    )
  ) {
    return "MANAGER";
  }

  return "CASHIER";
}
