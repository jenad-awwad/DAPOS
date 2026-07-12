import { PrismaClient, UserRole, Currency } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.upsert({
    where: { id: "seed-store-dapos" },
    update: { currency: Currency.ILS, taxRate: 0 },
    create: {
      id: "seed-store-dapos",
      name: "DAPOS Demo Store",
      address: "123 Main Street",
      phone: "+972-3-555-0100",
      currency: Currency.ILS,
      taxRate: 0,
    },
  });

  const admin = await prisma.user.upsert({
    where: {
      storeId_phone: {
        storeId: store.id,
        phone: "0501234567",
      },
    },
    update: {
      pin: "1234",
      name: "Store Admin",
      role: UserRole.ADMIN,
    },
    create: {
      storeId: store.id,
      phone: "0501234567",
      name: "Store Admin",
      role: UserRole.ADMIN,
      pin: "1234",
    },
  });

  const beverages = await prisma.category.upsert({
    where: {
      storeId_name: { storeId: store.id, name: "Beverages" },
    },
    update: {},
    create: { storeId: store.id, name: "Beverages", sortOrder: 1 },
  });

  const snacks = await prisma.category.upsert({
    where: {
      storeId_name: { storeId: store.id, name: "Snacks" },
    },
    update: {},
    create: { storeId: store.id, name: "Snacks", sortOrder: 2 },
  });

  const products = [
    {
      sku: "BEV-001",
      barcode: "0123456789012",
      name: "Sparkling Water 500ml",
      imageUrl: "https://images.unsplash.com/photo-1523362628745-0c100150b504?w=400",
      supplier: "Fresh Springs Co.",
      price: 1.99,
      cost: 0.85,
      onStock: 48,
      lowStockAt: 12,
      categoryId: beverages.id,
    },
    {
      sku: "BEV-002",
      barcode: "0123456789029",
      name: "Cold Brew Coffee",
      imageUrl: "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400",
      supplier: "Mountain Roast Ltd.",
      price: 3.49,
      cost: 1.2,
      onStock: 24,
      lowStockAt: 6,
      categoryId: beverages.id,
    },
    {
      sku: "SNK-001",
      barcode: "0123456789036",
      name: "Potato Chips",
      imageUrl: "https://images.unsplash.com/photo-1566478989038-e57605758d46?w=400",
      supplier: "SnackWorld Distributors",
      price: 2.29,
      cost: 0.95,
      onStock: 36,
      lowStockAt: 10,
      categoryId: snacks.id,
    },
    {
      sku: "SNK-002",
      barcode: "0123456789043",
      name: "Chocolate Bar",
      imageUrl: "https://images.unsplash.com/photo-1511381939415-e44015466834?w=400",
      supplier: "Sweet Supply Co.",
      price: 1.79,
      cost: 0.7,
      onStock: 60,
      lowStockAt: 15,
      categoryId: snacks.id,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: {
        storeId_sku: { storeId: store.id, sku: product.sku },
      },
      update: {
        imageUrl: product.imageUrl,
        supplier: product.supplier,
        onStock: product.onStock,
        isPriced: true,
      },
      create: {
        storeId: store.id,
        ...product,
        isPriced: true,
      },
    });
  }

  console.log("Seed complete:");
  console.log(`  Store:    ${store.name} (${store.currency})`);
  console.log(`  Admin:    ${admin.phone}  PIN: ${admin.pin}`);
  console.log(`  Currency: ILS | USD | JOD`);
  console.log(`  Items:    ${products.length} products in 2 categories`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
