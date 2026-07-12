import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireManager } from "../middleware/roles.js";
import {
  createBasicProduct,
  setProductPricing,
} from "../services/products.js";

const imageUrlSchema = z
  .string()
  .min(1)
  .max(3_000_000)
  .refine(
    (value) =>
      value.startsWith("data:image/") ||
      value.startsWith("http://") ||
      value.startsWith("https://"),
    { message: "Image must be a photo URL or uploaded image data" },
  );

const productStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "NEEDS_PRICING",
  "PRICED",
]);

const createBasicProductSchema = z.object({
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().min(1).max(50).optional().nullable(),
  name: z.string().min(1).max(200),
  supplier: z.string().min(1).max(200),
  imageUrl: imageUrlSchema,
  onStock: z.number().int().min(0).optional(),
  lowStockAt: z.number().int().min(0).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

const setPricingSchema = z.object({
  price: z.number().positive(),
  cost: z.number().min(0),
});

const updateProductSchema = z.object({
  sku: z.string().max(50).optional().nullable(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  imageUrl: imageUrlSchema.optional(),
  supplier: z.string().min(1).max(200).optional(),
  price: z.number().positive().optional(),
  cost: z.number().min(0).optional().nullable(),
  onStock: z.number().int().min(0).optional(),
  lowStockAt: z.number().int().min(0).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const listProductsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  barcode: z.string().trim().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  lowStock: z.enum(["true", "false"]).optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
  pricedOnly: z.enum(["true", "false"]).optional(),
  needsPricing: z.enum(["true", "false"]).optional(),
  status: productStatusSchema.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export const productRoutes = new Hono<AppEnv>();

productRoutes.get("/", requireAuth, async (c) => {
  const { storeId } = c.get("auth");
  const parsed = listProductsQuerySchema.safeParse({
    search: c.req.query("search"),
    name: c.req.query("name"),
    barcode: c.req.query("barcode"),
    categoryId: c.req.query("categoryId"),
    lowStock: c.req.query("lowStock"),
    includeInactive: c.req.query("includeInactive"),
    pricedOnly: c.req.query("pricedOnly"),
    needsPricing: c.req.query("needsPricing"),
    status: c.req.query("status"),
    dateFrom: c.req.query("dateFrom"),
    dateTo: c.req.query("dateTo"),
  });

  if (!parsed.success) {
    return c.json({ error: "Invalid product filters", details: parsed.error.flatten() }, 400);
  }

  const filters = parsed.data;
  const lowStock = filters.lowStock === "true";
  const includeInactive = filters.includeInactive === "true";
  const pricedOnly = filters.pricedOnly === "true";
  const needsPricing = filters.needsPricing === "true";

  const products = await prisma.product.findMany({
    where: {
      storeId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(pricedOnly ? { isPriced: true } : {}),
      ...(needsPricing ? { isPriced: false } : {}),
      ...(filters.status === "ACTIVE" ? { isActive: true } : {}),
      ...(filters.status === "INACTIVE" ? { isActive: false } : {}),
      ...(filters.status === "NEEDS_PRICING"
        ? { isActive: true, isPriced: false }
        : {}),
      ...(filters.status === "PRICED" ? { isActive: true, isPriced: true } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.name
        ? { name: { contains: filters.name, mode: "insensitive" } }
        : {}),
      ...(filters.barcode ? { barcode: { contains: filters.barcode } } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { sku: { contains: filters.search, mode: "insensitive" } },
              { barcode: { contains: filters.search } },
              { supplier: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });

  const filtered = lowStock
    ? products.filter(
        (p) => p.lowStockAt != null && p.onStock <= p.lowStockAt,
      )
    : products;

  return c.json({ products: serialize(filtered) });
});

productRoutes.get("/barcode/:barcode", requireAuth, async (c) => {
  const { storeId } = c.get("auth");
  const barcode = c.req.param("barcode");

  const product = await prisma.product.findFirst({
    where: { storeId, barcode, isActive: true, isPriced: true },
    include: { category: true },
  });

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  return c.json({ product: serialize(product) });
});

productRoutes.post("/", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = createBasicProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid product payload", details: parsed.error.flatten() }, 400);
  }

  if (parsed.data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: parsed.data.categoryId, storeId, isActive: true },
    });
    if (!category) {
      return c.json({ error: "Category not found" }, 400);
    }
  }

  if (parsed.data.sku?.trim()) {
    const skuTaken = await prisma.product.findFirst({
      where: { storeId, sku: parsed.data.sku.trim() },
    });
    if (skuTaken) {
      return c.json({ error: "SKU already exists" }, 400);
    }
  }

  try {
    const product = await createBasicProduct(storeId, {
      sku: parsed.data.sku?.trim() || null,
      barcode: parsed.data.barcode?.trim() || null,
      name: parsed.data.name,
      supplier: parsed.data.supplier,
      imageUrl: parsed.data.imageUrl,
      onStock: parsed.data.onStock,
      lowStockAt: parsed.data.lowStockAt,
      categoryId: parsed.data.categoryId ?? null,
      description: parsed.data.description ?? null,
    });
    return c.json({ product: serialize(product) }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create product";
    return c.json({ error: message }, 400);
  }
});

productRoutes.patch("/:id/pricing", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = setPricingSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid pricing payload", details: parsed.error.flatten() }, 400);
  }

  try {
    const product = await setProductPricing(
      storeId,
      c.req.param("id"),
      parsed.data.price,
      parsed.data.cost,
    );
    return c.json({ product: serialize(product) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not set pricing";
    return c.json({ error: message }, 400);
  }
});

productRoutes.get("/:id", requireAuth, async (c) => {
  const { storeId } = c.get("auth");
  const id = c.req.param("id");

  const product = await prisma.product.findFirst({
    where: { id, storeId, isActive: true },
    include: { category: true },
  });

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  return c.json({ product: serialize(product) });
});

productRoutes.patch("/:id", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");
  const body = await c.req.json().catch(() => null);
  const parsed = updateProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid product payload", details: parsed.error.flatten() }, 400);
  }

  const existing = await prisma.product.findFirst({
    where: { id: c.req.param("id"), storeId },
  });

  if (!existing) {
    return c.json({ error: "Product not found" }, 404);
  }

  if (parsed.data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: parsed.data.categoryId, storeId, isActive: true },
    });
    if (!category) {
      return c.json({ error: "Category not found" }, 400);
    }
  }

  if (parsed.data.sku?.trim()) {
    const skuTaken = await prisma.product.findFirst({
      where: {
        storeId,
        sku: parsed.data.sku.trim(),
        NOT: { id: existing.id },
      },
    });
    if (skuTaken) {
      return c.json({ error: "SKU already exists" }, 400);
    }
  }

  const nextPrice = parsed.data.price ?? existing.price.toNumber();
  const nextCost =
    parsed.data.cost !== undefined
      ? parsed.data.cost
      : existing.cost?.toNumber() ?? null;
  const pricingComplete =
    parsed.data.price !== undefined || parsed.data.cost !== undefined
      ? nextPrice > 0 && nextCost != null
      : existing.isPriced;

  try {
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.sku !== undefined ? { sku: parsed.data.sku?.trim() || null } : {}),
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.imageUrl !== undefined ? { imageUrl: parsed.data.imageUrl } : {}),
        ...(parsed.data.supplier !== undefined
          ? { supplier: parsed.data.supplier.trim() }
          : {}),
        ...(parsed.data.price !== undefined ? { price: parsed.data.price } : {}),
        ...(parsed.data.cost !== undefined ? { cost: parsed.data.cost } : {}),
        ...(parsed.data.onStock !== undefined ? { onStock: parsed.data.onStock } : {}),
        ...(parsed.data.lowStockAt !== undefined
          ? { lowStockAt: parsed.data.lowStockAt }
          : {}),
        ...(parsed.data.categoryId !== undefined
          ? { categoryId: parsed.data.categoryId }
          : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        ...(parsed.data.price !== undefined || parsed.data.cost !== undefined
          ? { isPriced: pricingComplete }
          : {}),
      },
      include: { category: true },
    });
    return c.json({ product: serialize(product) });
  } catch {
    return c.json({ error: "SKU already exists" }, 400);
  }
});

productRoutes.delete("/:id", requireAuth, requireManager, async (c) => {
  const { storeId } = c.get("auth");

  const existing = await prisma.product.findFirst({
    where: { id: c.req.param("id"), storeId, isActive: true },
  });

  if (!existing) {
    return c.json({ error: "Product not found" }, 404);
  }

  const product = await prisma.product.update({
    where: { id: existing.id },
    data: { isActive: false },
    include: { category: true },
  });

  return c.json({ product: serialize(product) });
});
