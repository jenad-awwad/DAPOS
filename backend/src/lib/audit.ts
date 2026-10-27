import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export async function recordAudit(
  db: Db,
  input: {
    storeId: string;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Prisma.InputJsonValue;
  },
) {
  await db.auditLog.create({
    data: {
      storeId: input.storeId,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: input.details,
    },
  });
}
