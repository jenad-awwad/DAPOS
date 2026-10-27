import { AppError } from "../lib/errors.js";
import {
  VendorLedgerSource,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertStoreAttachmentKey, resolveAttachmentUrl } from "../lib/object-storage.js";

export function normalizeVendorName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function upsertVendorByName(
  tx: Prisma.TransactionClient,
  storeId: string,
  vendorName: string,
) {
  const name = vendorName.trim();
  const normalizedName = normalizeVendorName(name);

  const existing = await tx.vendor.findFirst({
    where: { storeId, normalizedName },
  });

  if (existing) return existing;

  return tx.vendor.create({
    data: {
      storeId,
      name,
      normalizedName,
      startingBalance: 0,
    },
  });
}

export async function computeVendorBalance(
  tx: Prisma.TransactionClient,
  storeId: string,
  vendorId: string,
): Promise<number> {
  const vendor = await tx.vendor.findFirst({
    where: { id: vendorId, storeId },
  });
  if (!vendor) {
    throw new AppError("Vendor not found");
  }

  const invoiceAgg = await tx.vendorInvoice.aggregate({
    where: { storeId, vendorId },
    _sum: { total: true },
  });
  const paymentAgg = await tx.vendorPayment.aggregate({
    where: { storeId, vendorId },
    _sum: { amount: true },
  });

  const starting = vendor.startingBalance.toNumber();
  const invoiced = invoiceAgg._sum.total?.toNumber() ?? 0;
  const paid = paymentAgg._sum.amount?.toNumber() ?? 0;

  return roundMoney(starting + invoiced - paid);
}

export async function syncProjectOrderVendorInvoices(
  tx: Prisma.TransactionClient,
  storeId: string,
  orderId: string,
  orderNumber: string,
  invoiceDate: Date,
) {
  await tx.vendorInvoice.deleteMany({
    where: {
      storeId,
      sourceOrderId: orderId,
      source: VendorLedgerSource.PROJECT,
    },
  });

  const materials = await tx.orderProjectMaterial.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  });

  let index = 0;
  for (const line of materials) {
    const vendor = await upsertVendorByName(tx, storeId, line.vendor);
    index += 1;

    await tx.vendorInvoice.create({
      data: {
        storeId,
        vendorId: vendor.id,
        invoiceDate,
        invoiceNumber: `PRJ-${orderNumber}-${index}`,
        invoiceNumberAuto: true,
        total: line.lineTotal,
        source: VendorLedgerSource.PROJECT,
        sourceOrderId: orderId,
        orderProjectMaterialId: line.id,
        description: line.description,
      },
    });
  }
}

async function nextManualInvoiceNumber(
  tx: Prisma.TransactionClient,
  storeId: string,
): Promise<string> {
  const { vendorInvoiceSeq } = await tx.store.update({
    where: { id: storeId },
    data: { vendorInvoiceSeq: { increment: 1 } },
    select: { vendorInvoiceSeq: true },
  });
  return `INV-${String(vendorInvoiceSeq).padStart(5, "0")}`;
}

export async function listVendorInvoices(storeId: string, requestUrl?: string) {
  const rows = await prisma.vendorInvoice.findMany({
    where: { storeId },
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
  });

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      attachmentUrl: await resolveAttachmentUrl(row.attachmentKey, requestUrl),
    })),
  );
}

export async function listVendorPayments(storeId: string, requestUrl?: string) {
  const rows = await prisma.vendorPayment.findMany({
    where: { storeId },
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      attachmentUrl: await resolveAttachmentUrl(row.attachmentKey, requestUrl),
    })),
  );
}

export async function listVendorBalances(storeId: string) {
  const vendors = await prisma.vendor.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  });

  const results = [];
  for (const vendor of vendors) {
    const invoiceAgg = await prisma.vendorInvoice.aggregate({
      where: { storeId, vendorId: vendor.id },
      _sum: { total: true },
    });
    const paymentAgg = await prisma.vendorPayment.aggregate({
      where: { storeId, vendorId: vendor.id },
      _sum: { amount: true },
    });

    const startingBalance = vendor.startingBalance.toNumber();
    const invoiceTotal = invoiceAgg._sum.total?.toNumber() ?? 0;
    const paymentTotal = paymentAgg._sum.amount?.toNumber() ?? 0;
    const currentBalance = roundMoney(
      startingBalance + invoiceTotal - paymentTotal,
    );

    results.push({
      vendorId: vendor.id,
      name: vendor.name,
      startingBalance,
      invoiceTotal,
      paymentTotal,
      currentBalance,
    });
  }

  return results;
}

export async function createVendor(
  storeId: string,
  input: { name: string; startingBalance?: number },
) {
  const name = input.name.trim();
  if (!name) {
    throw new AppError("Vendor name is required");
  }

  const startingBalance = roundMoney(input.startingBalance ?? 0);
  if (startingBalance < 0) {
    throw new AppError("Starting balance cannot be negative");
  }

  const normalizedName = normalizeVendorName(name);
  const existing = await prisma.vendor.findFirst({
    where: { storeId, normalizedName },
  });
  if (existing) {
    throw new AppError("A vendor with this name already exists");
  }

  return prisma.vendor.create({
    data: {
      storeId,
      name,
      normalizedName,
      startingBalance,
    },
  });
}

export async function createManualVendorInvoice(input: {
  storeId: string;
  userId: string;
  vendorId?: string;
  vendorName?: string;
  invoiceDate: Date;
  invoiceNumber?: string;
  invoiceNumberAuto?: boolean;
  total: number;
  attachmentKey?: string | null;
}) {
  if (input.total <= 0) {
    throw new AppError("Invoice total must be greater than zero");
  }

  return prisma.$transaction(async (tx) => {
    let vendorId = input.vendorId;
    if (!vendorId) {
      if (!input.vendorName?.trim()) {
        throw new AppError("Vendor is required");
      }
      const vendor = await upsertVendorByName(
        tx,
        input.storeId,
        input.vendorName,
      );
      vendorId = vendor.id;
    } else {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId, storeId: input.storeId },
      });
      if (!vendor) {
        throw new AppError("Vendor not found");
      }
    }

    const auto = input.invoiceNumberAuto === true;
    const invoiceNumber = auto
      ? await nextManualInvoiceNumber(tx, input.storeId)
      : input.invoiceNumber?.trim();

    if (!invoiceNumber) {
      throw new AppError("Invoice number is required");
    }

    return tx.vendorInvoice.create({
      data: {
        storeId: input.storeId,
        vendorId,
        invoiceDate: input.invoiceDate,
        invoiceNumber,
        invoiceNumberAuto: auto,
        total: roundMoney(input.total),
        attachmentKey: assertStoreAttachmentKey(input.storeId, input.attachmentKey),
        source: VendorLedgerSource.MANUAL,
        createdById: input.userId,
      },
      include: { vendor: { select: { id: true, name: true } } },
    });
  });
}

export async function createVendorPayment(input: {
  storeId: string;
  userId: string;
  vendorId?: string;
  vendorName?: string;
  paidAt: Date;
  amount: number;
  attachmentKey?: string | null;
}) {
  if (input.amount <= 0) {
    throw new AppError("Payment amount must be greater than zero");
  }

  return prisma.$transaction(async (tx) => {
    let vendorId = input.vendorId;
    if (!vendorId) {
      if (!input.vendorName?.trim()) {
        throw new AppError("Vendor is required");
      }
      const vendor = await upsertVendorByName(
        tx,
        input.storeId,
        input.vendorName,
      );
      vendorId = vendor.id;
    } else {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId, storeId: input.storeId },
      });
      if (!vendor) {
        throw new AppError("Vendor not found");
      }
    }

    const balanceBefore = await computeVendorBalance(
      tx,
      input.storeId,
      vendorId,
    );
    const remainingBalance = roundMoney(balanceBefore - input.amount);

    return tx.vendorPayment.create({
      data: {
        storeId: input.storeId,
        vendorId,
        paidAt: input.paidAt,
        amount: roundMoney(input.amount),
        remainingBalance,
        attachmentKey: assertStoreAttachmentKey(input.storeId, input.attachmentKey),
        createdById: input.userId,
      },
      include: { vendor: { select: { id: true, name: true } } },
    });
  });
}

export async function listVendorOptions(storeId: string) {
  return prisma.vendor.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
