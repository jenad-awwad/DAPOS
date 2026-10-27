import { Prisma, UserRole } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { phoneCandidates } from "../lib/phone.js";
import {
  isPermissionKey,
  parsePermissionList,
  resolveUserPermissions,
  stampPermissionList,
  type PermissionKey,
} from "../lib/permissions.js";
import { serialize } from "../lib/serialize.js";
import { hashPin } from "../lib/pin.js";
import { errorResponse, AppError } from "../lib/errors.js";
import { assertCanGrant } from "../lib/grant-guard.js";
import { recordAudit } from "../lib/audit.js";
import {
  ensureStoreRoles,
  getStoreRoleById,
  syncUserRoleEnum,
} from "../services/store-roles.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";

const permissionSchema = z.string().refine(isPermissionKey, {
  message: "Invalid permission key",
});

const pinSchema = z.string().regex(/^\d{6}$/);

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(7).max(20),
  pin: pinSchema,
  role: z.nativeEnum(UserRole).optional(),
  storeRoleId: z.string().min(1).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(7).max(20).optional(),
  pin: pinSchema.optional(),
  role: z.nativeEnum(UserRole).optional(),
  storeRoleId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  customPolicies: z.array(permissionSchema).nullable().optional(),
});

function sanitizeUser(user: {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  storeId: string;
  storeRoleId: string | null;
  isActive: boolean;
  customPolicies?: unknown;
  createdAt: Date;
  updatedAt: Date;
  storeRole?: { id: string; name: string; systemCode: UserRole | null } | null;
}) {
  const customPolicies = parsePermissionList(user.customPolicies, user.role);
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    storeRoleId: user.storeRoleId,
    storeRoleName: user.storeRole?.name ?? null,
    storeId: user.storeId,
    isActive: user.isActive,
    customPolicies,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function resolveRoleAssignment(
  storeId: string,
  input: { role?: UserRole; storeRoleId?: string | null },
): Promise<{ storeRoleId: string; role: UserRole }> {
  await ensureStoreRoles(storeId);

  if (input.storeRoleId) {
    const storeRole = await getStoreRoleById(storeId, input.storeRoleId);
    if (!storeRole) {
      throw new AppError("Role not found");
    }
    return {
      storeRoleId: storeRole.id,
      role: syncUserRoleEnum(storeRole.systemCode, storeRole.permissions),
    };
  }

  if (input.role) {
    const roles = await prisma.storeRole.findMany({
      where: { storeId, systemCode: input.role },
    });
    const storeRole = roles[0];
    if (!storeRole) {
      throw new AppError("Role not found");
    }
    return { storeRoleId: storeRole.id, role: input.role };
  }

  throw new AppError("Role is required");
}

async function permissionsAfterChange(
  storeId: string,
  next: {
    role: UserRole;
    customPolicies: unknown;
    storeRoleId: string | null;
  },
): Promise<PermissionKey[]> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { rolePolicies: true },
  });
  const storeRole = next.storeRoleId
    ? await prisma.storeRole.findFirst({
        where: { id: next.storeRoleId, storeId },
      })
    : null;
  return resolveUserPermissions(
    next.role,
    next.customPolicies,
    store?.rolePolicies,
    storeRole?.permissions,
  );
}

export const userRoutes = new Hono<AppEnv>();

userRoutes.get("/cashiers", requireAuth, async (c) => {
  const { storeId } = c.get("auth");

  const users = await prisma.user.findMany({
    where: { storeId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return c.json({ users: serialize(users) });
});

userRoutes.get("/", requireAuth, requireAnyPermission("staff.manage"), async (c) => {
  const { storeId } = c.get("auth");

  const users = await prisma.user.findMany({
    where: { storeId },
    include: { storeRole: { select: { id: true, name: true, systemCode: true } } },
    orderBy: { name: "asc" },
  });

  return c.json({ users: serialize(users.map(sanitizeUser)) });
});

userRoutes.post("/", requireAuth, requireAnyPermission("staff.manage"), async (c) => {
  const auth = c.get("auth");
  const { storeId } = auth;
  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid user payload", details: parsed.error.flatten() }, 400);
  }

  if (!parsed.data.role && !parsed.data.storeRoleId) {
    return c.json({ error: "Role is required" }, 400);
  }

  const phone = parsed.data.phone.trim();

  const existing = await prisma.user.findFirst({
    where: { storeId, phone: { in: phoneCandidates(phone) } },
  });

  if (existing) {
    return c.json({ error: "Phone number already in use" }, 400);
  }

  try {
    const assignment = await resolveRoleAssignment(storeId, parsed.data);
    const nextPermissions = await permissionsAfterChange(storeId, {
      role: assignment.role,
      customPolicies: null,
      storeRoleId: assignment.storeRoleId,
    });
    assertCanGrant(
      { role: c.get("role"), permissions: c.get("permissions") },
      { permissions: nextPermissions, role: assignment.role },
    );

    const pinHash = await hashPin(parsed.data.pin);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          storeId,
          name: parsed.data.name.trim(),
          phone,
          pin: null,
          pinHash,
          role: assignment.role,
          storeRoleId: assignment.storeRoleId,
        },
        include: { storeRole: { select: { id: true, name: true, systemCode: true } } },
      });
      await recordAudit(tx, {
        storeId,
        actorId: auth.sub,
        action: "user.create",
        entityType: "user",
        entityId: created.id,
        details: { role: created.role, storeRoleId: created.storeRoleId },
      });
      return created;
    });

    return c.json({ user: serialize(sanitizeUser(user)) }, 201);
  } catch (error) {
    return errorResponse(c, error, "Could not create user");
  }
});

userRoutes.patch("/:id", requireAuth, requireAnyPermission("staff.manage"), async (c) => {
  const auth = c.get("auth");
  const { storeId, sub } = auth;
  const targetId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid user payload", details: parsed.error.flatten() }, 400);
  }

  const existing = await prisma.user.findFirst({
    where: { id: targetId, storeId },
  });

  if (!existing) {
    return c.json({ error: "User not found" }, 404);
  }

  const changesAccess =
    parsed.data.role !== undefined ||
    parsed.data.storeRoleId !== undefined ||
    parsed.data.customPolicies !== undefined ||
    parsed.data.isActive !== undefined;

  if (existing.role === "ADMIN" && c.get("role") !== "ADMIN") {
    return c.json({ error: "You can't edit an admin" }, 403);
  }

  if (parsed.data.phone) {
    const conflict = await prisma.user.findFirst({
      where: {
        storeId,
        id: { not: targetId },
        phone: { in: phoneCandidates(parsed.data.phone) },
      },
    });
    if (conflict) {
      return c.json({ error: "Phone number already in use" }, 400);
    }
  }

  try {
    let roleUpdate: { storeRoleId?: string; role?: UserRole } = {};
    if (parsed.data.storeRoleId !== undefined || parsed.data.role !== undefined) {
      roleUpdate = await resolveRoleAssignment(storeId, {
        storeRoleId: parsed.data.storeRoleId ?? undefined,
        role: parsed.data.role,
      });
    }

    const nextRole = roleUpdate.role ?? existing.role;
    const nextStoreRoleId =
      roleUpdate.storeRoleId !== undefined ? roleUpdate.storeRoleId : existing.storeRoleId;
    const nextCustom =
      parsed.data.customPolicies !== undefined
        ? parsed.data.customPolicies
        : existing.customPolicies;

    if (
      changesAccess ||
      parsed.data.role !== undefined ||
      parsed.data.storeRoleId !== undefined ||
      parsed.data.customPolicies !== undefined
    ) {
      const nextPermissions = await permissionsAfterChange(storeId, {
        role: nextRole,
        customPolicies: nextCustom,
        storeRoleId: nextStoreRoleId,
      });
      assertCanGrant(
        { role: c.get("role"), permissions: c.get("permissions") },
        { permissions: nextPermissions, role: nextRole },
      );
    }

    const demotesAdmin = existing.role === "ADMIN" && nextRole !== "ADMIN";
    const deactivatesAdmin = existing.role === "ADMIN" && parsed.data.isActive === false;
    if (existing.isActive && (demotesAdmin || deactivatesAdmin)) {
      const admins = await prisma.user.count({
        where: { storeId, role: "ADMIN", isActive: true },
      });
      if (admins <= 1) {
        return c.json({ error: "The store must keep at least one active admin" }, 400);
      }
    }

    if (targetId === sub && changesAccess) {
      return c.json({ error: "You can't change your own access" }, 403);
    }

    const pinHash = parsed.data.pin !== undefined ? await hashPin(parsed.data.pin) : undefined;
    const revoke = parsed.data.pin !== undefined || parsed.data.isActive === false;

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone.trim() } : {}),
          ...(pinHash !== undefined
            ? {
                pinHash,
                pin: null,
                failedPinAttempts: 0,
                lockedUntil: null,
              }
            : {}),
          ...(roleUpdate.storeRoleId !== undefined
            ? { storeRoleId: roleUpdate.storeRoleId, role: roleUpdate.role }
            : parsed.data.role !== undefined
              ? { role: parsed.data.role }
              : {}),
          ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
          ...(parsed.data.customPolicies !== undefined
            ? {
                customPolicies:
                  parsed.data.customPolicies === null
                    ? Prisma.JsonNull
                    : stampPermissionList(parsed.data.customPolicies),
              }
            : {}),
          ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
        },
        include: { storeRole: { select: { id: true, name: true, systemCode: true } } },
      });

      if (parsed.data.pin !== undefined) {
        await recordAudit(tx, {
          storeId,
          actorId: sub,
          action: "user.pin_change",
          entityType: "user",
          entityId: updated.id,
        });
      }
      if (parsed.data.isActive === false && existing.isActive) {
        await recordAudit(tx, {
          storeId,
          actorId: sub,
          action: "user.deactivate",
          entityType: "user",
          entityId: updated.id,
        });
      }
      if (
        parsed.data.role !== undefined ||
        parsed.data.storeRoleId !== undefined ||
        parsed.data.customPolicies !== undefined
      ) {
        await recordAudit(tx, {
          storeId,
          actorId: sub,
          action: "user.access_change",
          entityType: "user",
          entityId: updated.id,
          details: {
            role: updated.role,
            storeRoleId: updated.storeRoleId,
          },
        });
      }
      return updated;
    });

    return c.json({ user: serialize(sanitizeUser(user)) });
  } catch (error) {
    return errorResponse(c, error, "Could not update user");
  }
});
