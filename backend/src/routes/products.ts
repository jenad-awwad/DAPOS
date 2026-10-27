import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { serialize } from "../lib/serialize.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";
import { errorResponse } from "../lib/errors.js";
import { recordAudit } from "../lib/audit.js";
import { canViewCost, withCostVisibility } from "../lib/cost-visibility.js";
import { userHasPermission } from "../lib/permissions.js";
import { persistProductImage, withProductImageUrl } from "../lib/product-images.js";
import {
  assignPricingRequest,
  createBasicProduct,
  listPricingAssignees,
  listPricingRequests,
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
  supplier: z.string().min(1).max(200).optional(),
  vendorId: z.string().min(1).optional().nullable(),
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
  vendorId: z.string().min(1).nullable().optional(),
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

const assignPricingRequestSchema = z.object({
  assignedToId: z.string().min(1).nullable(),
});

/** Serializes a product for the response: absolute image URL, cost hidden when not allowed. */
function productOut<T extends { imageUrl: string; cost?: unknown }>(
  product: T,
  requestUrl: string,
  showCost = true,
): T {
  return withCostVisibility(withProductImageUrl(serialize(product), requestUrl), showCost);
}

async function resolveSupplierLink(
  storeId: string,
  vendorId: string | null | undefined,
  supplier: string | undefined,
): Promise<{ vendorId: string | null; supplier: string } | { error: string }> {
  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, storeId },
    });
    if (!vendor) return { error: "Supplier not found" };
    return { vendorId: vendor.id, supplier: vendor.name };
  }

  const name = supplier?.trim() ?? "";
  if (!name) return { error: "Supplier is required" };
  const normalizedName = name.toLowerCase().replace(/\s+/g, " ");
  const match = await prisma.vendor.findFirst({
    where: { storeId, normalizedName },
  });
  return { vendorId: match?.id ?? null, supplier: match?.name ?? name };
}

export const productRoutes = new Hono<AppEnv>();

productRoutes.get("/", requireAuth, async (c) => {
  const auth = c.get("auth");
  const { storeId } = auth;
  const showCost = canViewCost(c.get("permissions"));
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
    include: { category: true, vendor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const filtered = lowStock
    ? products.filter(
        (p) => p.lowStockAt != null && p.onStock <= p.lowStockAt,
      )
    : products;

  const productsOut = filtered.map((product) => productOut(product, c.req.url, showCost));
  return c.json({ products: productsOut });
});

productRoutes.get("/barcode/:barcode", requireAuth, async (c) => {
  const { storeId, sub } = c.get("auth");
  const barcode = c.req.param("barcode");

  const product = await prisma.product.findFirst({
    where: { storeId, barcode, isActive: true, isPriced: true },
    include: { category: true, vendor: { select: { id: true, name: true } } },
  });

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const showCost = canViewCost(c.get("permissions"));
  return c.json({ product: productOut(product, c.req.url, showCost) });
});

productRoutes.get(
  "/pricing-requests",
  requireAuth,
  requireAnyPermission("products.price", "products.manage"),
  async (c) => {
    const { storeId } = c.get("auth");
    const [requests, assignees] = await Promise.all([
      listPricingRequests(storeId),
      listPricingAssignees(storeId),
    ]);
    return c.json({
      requests: serialize(requests).map((request) => ({
        ...request,
        product: withProductImageUrl(request.product, c.req.url),
      })),
      assignees,
    });
  },
);

productRoutes.patch(
  "/pricing-requests/:id",
  requireAuth,
  requireAnyPermission("products.price", "products.manage"),
  async (c) => {
    const { storeId } = c.get("auth");
    const body = await c.req.json().catch(() => null);
    const parsed = assignPricingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid assignment", details: parsed.error.flatten() }, 400);
    }

    try {
      const request = await assignPricingRequest(
        storeId,
        c.req.param("id"),
        parsed.data.assignedToId,
      );
      const out = serialize(request);
      return c.json({
        request: { ...out, product: withProductImageUrl(out.product, c.req.url) },
      });
    } catch (error) {
      return errorResponse(c, error, "Could not assign request");
    }
  },
);

productRoutes.post(
  "/",
  requireAuth,
  requireAnyPermission("products.details", "products.manage"),
  async (c) => {
  const { storeId, sub } = c.get("auth");
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
    const supplierLink = await resolveSupplierLink(
      storeId,
      parsed.data.vendorId,
      parsed.data.supplier,
    );
    if ("error" in supplierLink) {
      return c.json({ error: supplierLink.error }, 400);
    }

    const product = await createBasicProduct(storeId, {
      sku: parsed.data.sku?.trim() || null,
      barcode: parsed.data.barcode?.trim() || null,
      name: parsed.data.name,
      supplier: supplierLink.supplier,
      vendorId: supplierLink.vendorId,
      imageUrl: await persistProductImage(parsed.data.imageUrl, storeId),
      onStock: parsed.data.onStock,
      lowStockAt: parsed.data.lowStockAt,
      categoryId: parsed.data.categoryId ?? null,
      description: parsed.data.description ?? null,
      requestedById: sub,
    });
    return c.json({ product: productOut(product, c.req.url) }, 201);
  } catch (error) {
    return errorResponse(c, error, "Could not create product");
  }
});

productRoutes.patch(
  "/:id/pricing",
  requireAuth,
  requireAnyPermission("products.price", "products.manage"),
  async (c) => {
  const { storeId, sub } = c.get("auth");
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
      sub,
    );
    return c.json({ product: productOut(product, c.req.url) });
  } catch (error) {
    return errorResponse(c, error, "Could not set pricing");
  }
});

productRoutes.get("/:id", requireAuth, async (c) => {
  const { storeId, sub } = c.get("auth");
  const id = c.req.param("id");

  const product = await prisma.product.findFirst({
    where: { id, storeId, isActive: true },
    include: { category: true, vendor: { select: { id: true, name: true } } },
  });

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const showCost = canViewCost(c.get("permissions"));
  return c.json({ product: productOut(product, c.req.url, showCost) });
});

productRoutes.patch(
  "/:id",
  requireAuth,
  requireAnyPermission("products.details", "products.price", "products.manage"),
  async (c) => {
  const { storeId, sub } = c.get("auth");
  const permissions = c.get("permissions");
  const canEditDetails =
    userHasPermission(permissions, "products.details") ||
    userHasPermission(permissions, "products.manage");
  const canSetPrice =
    userHasPermission(permissions, "products.price") ||
    userHasPermission(permissions, "products.manage");
  const canManage = userHasPermission(permissions, "products.manage");
  const body = await c.req.json().catch(() => null);
  const parsed = updateProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid product payload", details: parsed.error.flatten() }, 400);
  }

  const touchesDetails = (
    ["sku", "name", "description", "imageUrl", "supplier", "vendorId", "onStock", "lowStockAt", "categoryId"] as const
  ).some((key) => parsed.data[key] !== undefined);
  const touchesPrice = parsed.data.price !== undefined || parsed.data.cost !== undefined;
  if (touchesDetails && !canEditDetails) {
    return c.json({ error: "You do not have permission to edit item details" }, 403);
  }
  if (touchesPrice && !canSetPrice) {
    return c.json({ error: "You do not have permission to set prices" }, 403);
  }
  if (parsed.data.isActive !== undefined && !canManage) {
    return c.json({ error: "You do not have permission to publish or deactivate products" }, 403);
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

  let linkedSupplier: { vendorId: string | null; supplier: string } | undefined;
  if (parsed.data.vendorId !== undefined || parsed.data.supplier !== undefined) {
    const supplierLink = await resolveSupplierLink(
      storeId,
      parsed.data.vendorId,
      parsed.data.supplier,
    );
    if ("error" in supplierLink) {
      return c.json({ error: supplierLink.error }, 400);
    }
    linkedSupplier = supplierLink;
  }

  let storedImageUrl: string | undefined;
  if (parsed.data.imageUrl !== undefined) {
    try {
      storedImageUrl = await persistProductImage(parsed.data.imageUrl, storeId);
    } catch (error) {
      return errorResponse(c, error, "Could not save product photo");
    }
  }

  try {
    const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.sku !== undefined ? { sku: parsed.data.sku?.trim() || null } : {}),
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(storedImageUrl !== undefined ? { imageUrl: storedImageUrl } : {}),
        ...(linkedSupplier
          ? { supplier: linkedSupplier.supplier, vendorId: linkedSupplier.vendorId }
          : parsed.data.supplier !== undefined
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
      include: { category: true, vendor: { select: { id: true, name: true } } },
    });
    if (pricingComplete && touchesPrice) {
      await tx.productPricingRequest.updateMany({
        where: { storeId, productId: existing.id, status: "PENDING" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          completedById: sub,
        },
      });
    }
    if (touchesPrice) {
      await recordAudit(tx, {
        storeId,
        actorId: sub,
        action: "product.price_change",
        entityType: "product",
        entityId: existing.id,
        details: {
          price: parsed.data.price,
          cost: parsed.data.cost,
        },
      });
    }
    return updated;
    });
    return c.json({ product: productOut(product, c.req.url) });
  } catch (error) {
    return errorResponse(c, error, "Could not update product");
  }
});

productRoutes.delete("/:id", requireAuth, requireAnyPermission("products.manage"), async (c) => {
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
    include: { category: true, vendor: { select: { id: true, name: true } } },
  });

  return c.json({ product: productOut(product, c.req.url) });
});
