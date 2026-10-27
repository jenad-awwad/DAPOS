import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { phoneCandidates } from "../lib/phone.js";
import { resolveUserPermissions } from "../lib/permissions.js";
import { serialize } from "../lib/serialize.js";
import { DUMMY_PIN_HASH, hashPin, plainPinsEqual, verifyPin } from "../lib/pin.js";
import { recordAudit } from "../lib/audit.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { noteLoginFailure } from "../middleware/rate-limit.js";
import { ensureStoreRoles } from "../services/store-roles.js";

const loginSchema = z.object({
  phone: z.string().min(7).max(20),
  pin: z.string().regex(/^\d{4,6}$/),
});

const LOCK_MS = 15 * 60 * 1000;

export const authRoutes = new Hono<AppEnv>();

function sessionPayload(user: {
  id: string;
  name: string;
  phone: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  storeRoleId: string | null;
  storeId: string;
  customPolicies: unknown;
  store: { id: string; name: string; currency: string; taxRate: unknown; rolePolicies: unknown };
  storeRole: { name: string; permissions: unknown } | null;
}) {
  const permissions = resolveUserPermissions(
    user.role,
    user.customPolicies,
    user.store.rolePolicies,
    user.storeRole?.permissions,
  );

  return {
    user: serialize({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      storeRoleId: user.storeRoleId,
      storeRoleName: user.storeRole?.name ?? null,
      storeId: user.storeId,
      permissions,
    }),
    store: serialize({
      id: user.store.id,
      name: user.store.name,
      currency: user.store.currency,
      taxRate: user.store.taxRate,
    }),
  };
}

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Phone and PIN are required" }, 400);
  }

  const { pin } = parsed.data;
  const now = new Date();

  const users = await prisma.user.findMany({
    where: {
      phone: { in: phoneCandidates(parsed.data.phone) },
      isActive: true,
      store: { isActive: true },
    },
    include: { store: true, storeRole: true },
  });

  if (users.length === 0) {
    await verifyPin(pin, DUMMY_PIN_HASH);
    const limit = noteLoginFailure(c);
    if (limit.blocked) {
      c.header("Retry-After", String(limit.retryAfter));
      return c.json({ error: "Too many attempts. Try again later." }, 429);
    }
    return c.json({ error: "Invalid phone or PIN" }, 401);
  }

  const unlocked = users.filter(
    (user) => !user.lockedUntil || user.lockedUntil.getTime() <= now.getTime(),
  );

  if (unlocked.length === 0) {
    const waitMs = Math.min(
      ...users.map((user) => (user.lockedUntil?.getTime() ?? now.getTime()) - now.getTime()),
    );
    const minutes = Math.max(1, Math.ceil(waitMs / 60000));
    return c.json(
      { error: `Too many attempts. Try again in ${minutes} minutes.` },
      429,
    );
  }

  let matched: (typeof users)[number] | null = null;
  for (const user of unlocked) {
    if (user.pinHash) {
      if (await verifyPin(pin, user.pinHash)) {
        matched = user;
        break;
      }
    } else if (user.pin && plainPinsEqual(pin, user.pin)) {
      const pinHash = await hashPin(pin);
      await prisma.user.update({
        where: { id: user.id },
        data: { pinHash, pin: null },
      });
      matched = { ...user, pinHash, pin: null };
      break;
    }
  }

  if (!matched) {
    await prisma.$transaction(async (tx) => {
      for (const user of unlocked) {
        const attempts = user.failedPinAttempts + 1;
        const locked = attempts >= 5;
        await tx.user.update({
          where: { id: user.id },
          data: locked
            ? { failedPinAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) }
            : { failedPinAttempts: attempts },
        });
        if (locked) {
          await recordAudit(tx, {
            storeId: user.storeId,
            actorId: user.id,
            action: "user.lockout",
            entityType: "user",
            entityId: user.id,
          });
        }
      }
    });

    const limit = noteLoginFailure(c);
    if (limit.blocked) {
      c.header("Retry-After", String(limit.retryAfter));
      return c.json({ error: "Too many attempts. Try again later." }, 429);
    }
    return c.json({ error: "Invalid phone or PIN" }, 401);
  }

  await prisma.user.update({
    where: { id: matched.id },
    data: { failedPinAttempts: 0, lockedUntil: null },
  });

  const token = await signToken({
    sub: matched.id,
    storeId: matched.storeId,
    role: matched.role,
    tokenVersion: matched.tokenVersion,
  });

  await ensureStoreRoles(matched.storeId);
  const refreshed = await prisma.user.findFirstOrThrow({
    where: { id: matched.id },
    include: { store: true, storeRole: true },
  });

  return c.json({
    token,
    ...sessionPayload(refreshed),
  });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const auth = c.get("auth");
  await prisma.user.update({
    where: { id: auth.sub },
    data: { tokenVersion: { increment: 1 } },
  });
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const auth = c.get("auth");

  const user = await prisma.user.findFirst({
    where: { id: auth.sub, storeId: auth.storeId, isActive: true },
    include: { store: true, storeRole: true },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await ensureStoreRoles(user.storeId);
  const refreshed = await prisma.user.findFirstOrThrow({
    where: { id: user.id },
    include: { store: true, storeRole: true },
  });

  return c.json(sessionPayload(refreshed));
});
