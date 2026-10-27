import { AppError } from "../lib/errors.js";
import { Prisma } from "@prisma/client";
import { resolveUserPermissions } from "../lib/permissions.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../lib/audit.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function generateProductBarcode(
  storeId: string,
  client: DbClient = prisma,
): Promise<string> {
  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const count = await client.product.count({
    where: {
      storeId,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });

  const datePart = dayStart.toISOString().slice(0, 10).replace(/-/g, "");
  const sequence = String(count + 1).padStart(4, "0");
  return `${datePart}${sequence}`;
}

export type CreateBasicProductInput = {
  sku?: string | null;
  barcode?: string | null;
  name: string;
  supplier: string;
  imageUrl: string;
  onStock?: number;
  lowStockAt?: number | null;
  categoryId?: string | null;
  description?: string | null;
  vendorId?: string | null;
  requestedById: string;
};

async function openPricingRequest(
  client: DbClient,
  input: { storeId: string; productId: string; requestedById: string },
) {
  await client.productPricingRequest.create({
    data: {
      storeId: input.storeId,
      productId: input.productId,
      requestedById: input.requestedById,
      status: "PENDING",
      submittedAt: new Date(),
    },
  });
}

export async function createBasicProduct(storeId: string, input: CreateBasicProductInput) {
  const trimmedBarcode = input.barcode?.trim();

  if (trimmedBarcode) {
    const barcodeTaken = await prisma.product.findFirst({
      where: { storeId, barcode: trimmedBarcode },
    });
    if (barcodeTaken) {
      throw new AppError("Barcode already exists");
    }

    const created = await prisma.product.create({
      data: {
        storeId,
        sku: input.sku?.trim() || null,
        barcode: trimmedBarcode,
        name: input.name.trim(),
        supplier: input.supplier.trim(),
        imageUrl: input.imageUrl,
        onStock: input.onStock ?? 0,
        lowStockAt: input.lowStockAt ?? null,
        categoryId: input.categoryId ?? null,
        description: input.description ?? null,
        vendorId: input.vendorId ?? null,
        isPriced: false,
        price: 0,
      },
      include: { category: true, vendor: { select: { id: true, name: true } } },
    });
    await openPricingRequest(prisma, {
      storeId,
      productId: created.id,
      requestedById: input.requestedById,
    });
    return created;
  }

  return prisma.$transaction(async (tx) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const barcode = await generateProductBarcode(storeId, tx);
      try {
        const created = await tx.product.create({
          data: {
            storeId,
            sku: input.sku?.trim() || null,
            barcode,
            name: input.name.trim(),
            supplier: input.supplier.trim(),
            imageUrl: input.imageUrl,
            onStock: input.onStock ?? 0,
            lowStockAt: input.lowStockAt ?? null,
            categoryId: input.categoryId ?? null,
            description: input.description ?? null,
            vendorId: input.vendorId ?? null,
            isPriced: false,
            price: 0,
          },
          include: { category: true, vendor: { select: { id: true, name: true } } },
        });
        await openPricingRequest(tx, {
          storeId,
          productId: created.id,
          requestedById: input.requestedById,
        });
        return created;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
      }
    }
    throw new AppError("Could not generate a unique barcode");
  });
}

export async function setProductPricing(
  storeId: string,
  productId: string,
  price: number,
  cost: number,
  completedById: string,
) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, storeId },
  });
  if (!existing) {
    throw new AppError("Product not found");
  }

  const completedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id: existing.id },
      data: {
        price,
        cost,
        isPriced: true,
      },
      include: { category: true, vendor: { select: { id: true, name: true } } },
    });
    await tx.productPricingRequest.updateMany({
      where: { storeId, productId: existing.id, status: "PENDING" },
      data: {
        status: "COMPLETED",
        completedAt,
        completedById,
      },
    });
    await recordAudit(tx, {
      storeId,
      actorId: completedById,
      action: "product.price_change",
      entityType: "product",
      entityId: existing.id,
      details: {
        price,
        cost,
        previousPrice: existing.price.toNumber(),
        previousCost: existing.cost?.toNumber() ?? null,
      },
    });
    return product;
  });
}

const pricingRequestInclude = {
  product: { include: { category: true, vendor: { select: { id: true, name: true } } } },
  requestedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
} as const;

export async function listPricingRequests(storeId: string) {
  return prisma.productPricingRequest.findMany({
    where: { storeId },
    include: pricingRequestInclude,
    orderBy: [{ status: "desc" }, { submittedAt: "desc" }],
  });
}

export async function listPricingAssignees(storeId: string) {
  const users = await prisma.user.findMany({
    where: { storeId, isActive: true },
    include: {
      storeRole: true,
      store: { select: { rolePolicies: true } },
    },
    orderBy: { name: "asc" },
  });

  return users
    .filter((user) => {
      const permissions = resolveUserPermissions(
        user.role,
        user.customPolicies,
        user.store.rolePolicies,
        user.storeRole?.permissions,
      );
      return (
        permissions.includes("products.price") ||
        permissions.includes("products.manage")
      );
    })
    .map((user) => ({ id: user.id, name: user.name }));
}

export async function assignPricingRequest(
  storeId: string,
  requestId: string,
  assignedToId: string | null,
) {
  const existing = await prisma.productPricingRequest.findFirst({
    where: { id: requestId, storeId, status: "PENDING" },
  });
  if (!existing) {
    throw new AppError("Open pricing request not found");
  }

  if (assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, storeId, isActive: true },
    });
    if (!assignee) {
      throw new AppError("Assigned user not found");
    }
  }

  return prisma.productPricingRequest.update({
    where: { id: existing.id },
    data: { assignedToId },
    include: pricingRequestInclude,
  });
}
