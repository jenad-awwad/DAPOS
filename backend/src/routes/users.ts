import { Prisma, UserRole } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { phoneCandidates } from "../lib/phone.js";
import {
  isPermissionKey,
  parsePermissionList,
} from "../lib/permissions.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAdmin, requireManager } from "../middleware/roles.js";

const permissionSchema = z.string().refine(isPermissionKey, {
  message: "Invalid permission key",
});

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(7).max(20),
  pin: z.string().min(4).max(6),
  role: z.nativeEnum(UserRole),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(7).max(20).optional(),
  pin: z.string().min(4).max(6).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  customPolicies: z.array(permissionSchema).nullable().optional(),
});

function sanitizeUser(user: {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  storeId: string;
  isActive: boolean;
  customPolicies?: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const customPolicies = parsePermissionList(user.customPolicies);
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    storeId: user.storeId,
    isActive: user.isActive,
    customPolicies,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
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

userRoutes.get("/", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");

  const users = await prisma.user.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  });

  return c.json({ users: serialize(users.map(sanitizeUser)) });
});

userRoutes.post("/", requireAuth, requireAdmin, async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid user payload", details: parsed.error.flatten() }, 400);
  }

  const phone = parsed.data.phone.trim();

  const existing = await prisma.user.findFirst({
    where: { storeId, phone: { in: phoneCandidates(phone) } },
  });

  if (existing) {
    return c.json({ error: "Phone number already in use" }, 400);
  }

  const user = await prisma.user.create({
    data: {
      storeId,
      name: parsed.data.name.trim(),
      phone,
      pin: parsed.data.pin,
      role: parsed.data.role,
    },
  });

  return c.json({ user: serialize(sanitizeUser(user)) }, 201);
});

userRoutes.patch("/:id", requireAuth, requireAdmin, async (c) => {
  const { storeId, sub } = c.get("auth");
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

  if (targetId === sub && parsed.data.isActive === false) {
    return c.json({ error: "You cannot deactivate your own account" }, 400);
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

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone.trim() } : {}),
      ...(parsed.data.pin !== undefined ? { pin: parsed.data.pin } : {}),
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.customPolicies !== undefined
        ? {
            customPolicies:
              parsed.data.customPolicies === null
                ? Prisma.JsonNull
                : parsed.data.customPolicies,
          }
        : {}),
    },
  });

  return c.json({ user: serialize(sanitizeUser(user)) });
});
