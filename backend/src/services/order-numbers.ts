import type { Prisma } from "@prisma/client";

export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  storeId: string,
): Promise<string> {
  const { orderSeq } = await tx.store.update({
    where: { id: storeId },
    data: { orderSeq: { increment: 1 } },
    select: { orderSeq: true },
  });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ORD-${date}-${String(orderSeq).padStart(4, "0")}`;
}
