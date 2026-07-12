import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

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
};

export async function createBasicProduct(storeId: string, input: CreateBasicProductInput) {
  const trimmedBarcode = input.barcode?.trim();

  if (trimmedBarcode) {
    const barcodeTaken = await prisma.product.findFirst({
      where: { storeId, barcode: trimmedBarcode },
    });
    if (barcodeTaken) {
      throw new Error("Barcode already exists");
    }

    return prisma.product.create({
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
        isPriced: false,
        price: 0,
      },
      include: { category: true },
    });
  }

  return prisma.$transaction(async (tx) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const barcode = await generateProductBarcode(storeId, tx);
      try {
        return await tx.product.create({
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
            isPriced: false,
            price: 0,
          },
          include: { category: true },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("Unique constraint")) {
          throw error;
        }
      }
    }
    throw new Error("Could not generate a unique barcode");
  });
}

export async function setProductPricing(
  storeId: string,
  productId: string,
  price: number,
  cost: number,
) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, storeId },
  });
  if (!existing) {
    throw new Error("Product not found");
  }

  return prisma.product.update({
    where: { id: existing.id },
    data: {
      price,
      cost,
      isPriced: true,
    },
    include: { category: true },
  });
}
