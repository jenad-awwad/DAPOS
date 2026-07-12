import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireManager } from "../middleware/roles.js";

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const categoryRoutes = new Hono<AppEnv>();

categoryRoutes.get("/", requireAuth, async (c) => {
  const { storeId } = c.get("auth");

  const categories = await prisma.category.findMany({
    where: { storeId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return c.json({ categories: serialize(categories) });
});

categoryRoutes.get("/all", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");

  const categories = await prisma.category.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  return c.json({ categories: serialize(categories) });
});

categoryRoutes.post("/", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid category payload", details: parsed.error.flatten() }, 400);
  }

  try {
    const category = await prisma.category.create({
      data: {
        storeId,
        name: parsed.data.name.trim(),
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });
    return c.json({ category: serialize(category) }, 201);
  } catch {
    return c.json({ error: "Category name already exists" }, 400);
  }
});

categoryRoutes.patch("/:id", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = updateCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid category payload", details: parsed.error.flatten() }, 400);
  }

  const existing = await prisma.category.findFirst({
    where: { id: c.req.param("id"), storeId },
  });

  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  try {
    const category = await prisma.category.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    });
    return c.json({ category: serialize(category) });
  } catch {
    return c.json({ error: "Category name already exists" }, 400);
  }
});

categoryRoutes.delete("/:id", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");

  const existing = await prisma.category.findFirst({
    where: { id: c.req.param("id"), storeId, isActive: true },
  });

  if (!existing) {
    return c.json({ error: "Category not found" }, 404);
  }

  const category = await prisma.category.update({
    where: { id: existing.id },
    data: { isActive: false },
  });

  return c.json({ category: serialize(category) });
});
