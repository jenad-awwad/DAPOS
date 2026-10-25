/**
 * Moves product photos that were saved as base64 data URLs inside the `products`
 * table into file storage (local `uploads/` or S3, whichever the backend uses).
 *
 * Safe to re-run: products whose `imageUrl` is already a stored path or an
 * external URL are skipped. Run from `backend/`:
 *
 *   npm run images:migrate
 */
import { prisma } from "../src/lib/prisma.js";
import { isDataImageUrl, persistProductImage } from "../src/lib/product-images.js";

const BATCH_SIZE = 25;

async function main() {
  let migrated = 0;
  let failed = 0;
  let cursor: string | undefined;

  for (;;) {
    const products = await prisma.product.findMany({
      where: { imageUrl: { startsWith: "data:image/" } },
      select: { id: true, storeId: true, name: true, imageUrl: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (products.length === 0) break;

    for (const product of products) {
      cursor = product.id;
      if (!isDataImageUrl(product.imageUrl)) continue;
      try {
        const imageUrl = await persistProductImage(product.imageUrl, product.storeId);
        await prisma.product.update({ where: { id: product.id }, data: { imageUrl } });
        migrated += 1;
        console.log(`migrated ${product.id} (${product.name}) -> ${imageUrl}`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed ${product.id} (${product.name}): ${message}`);
      }
    }
  }

  console.log(`done: ${migrated} migrated, ${failed} failed`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
