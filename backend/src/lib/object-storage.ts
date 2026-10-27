import { AppError } from "./errors.js";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

function localUploadRoot(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) return configured;
  return join(dirname(fileURLToPath(import.meta.url)), "../../uploads");
}

export function storageMode(): "s3" | "volume" | "local" | "ephemeral" {
  if (isRemoteStorageConfigured()) return "s3";
  if (process.env.UPLOAD_DIR?.trim()) return "volume";
  if (process.env.NODE_ENV === "production") return "ephemeral";
  return "local";
}

function storageConfig() {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || "auto";
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim();

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}

let client: S3Client | null = null;

function getClient() {
  const config = storageConfig();
  if (!config) return null;

  if (!client) {
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return { client, config };
}

/** True when files live in S3-compatible storage rather than on the local disk. */
export function isRemoteStorageConfigured(): boolean {
  return getClient() != null;
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

/** Folders under `stores/<storeId>/` that uploaded files may be written to. */
type StorageFolder = "vendor-attachments" | "product-images";

function buildObjectKey(storeId: string, folder: StorageFolder, ext: string): string {
  return `stores/${storeId}/${folder}/${randomUUID()}.${ext}`;
}

export function isSafeAttachmentKey(key: string): boolean {
  if (!key || key.includes("..") || key.includes("\\")) return false;
  return /^stores\/[a-zA-Z0-9_-]+\/(vendor-attachments|product-images)\/[a-zA-Z0-9._-]+$/.test(
    key,
  );
}

export function isProductImageKey(key: string): boolean {
  return isSafeAttachmentKey(key) && key.includes("/product-images/");
}

function localFilePath(key: string): string {
  const rootDir = localUploadRoot();
  const resolved = normalize(join(rootDir, key));
  const root = normalize(rootDir + sep);
  if (!resolved.startsWith(root) && resolved !== normalize(rootDir)) {
    throw new AppError("Invalid attachment path");
  }
  return resolved;
}

async function uploadLocal(buffer: Buffer, key: string): Promise<string> {
  const filePath = localFilePath(key);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return key;
}

async function uploadToFolder(
  buffer: Buffer,
  contentType: string,
  storeId: string,
  folder: StorageFolder,
): Promise<string> {
  const key = buildObjectKey(storeId, folder, extensionFor(contentType));
  const ctx = getClient();
  if (!ctx) {
    return uploadLocal(buffer, key);
  }

  await ctx.client.send(
    new PutObjectCommand({
      Bucket: ctx.config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentDisposition: "inline",
    }),
  );

  return key;
}

export async function readLocalAttachment(
  key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isSafeAttachmentKey(key)) return null;
  try {
    const buffer = await readFile(localFilePath(key));
    const ext = key.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/jpeg";
    return { buffer, contentType };
  } catch {
    return null;
  }
}

export function uploadVendorAttachment(
  buffer: Buffer,
  contentType: string,
  storeId: string,
): Promise<string> {
  return uploadToFolder(buffer, contentType, storeId, "vendor-attachments");
}

export function uploadProductImage(
  buffer: Buffer,
  contentType: string,
  storeId: string,
): Promise<string> {
  return uploadToFolder(buffer, contentType, storeId, "product-images");
}

export function apiPublicOrigin(requestUrl?: string): string {
  const fromEnv = process.env.PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      /* ignore */
    }
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function assertStoreAttachmentKey(
  storeId: string,
  key: string | null | undefined,
): string | null {
  if (key == null) return null;
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (
    !isSafeAttachmentKey(trimmed) ||
    !trimmed.startsWith(`stores/${storeId}/vendor-attachments/`)
  ) {
    throw new AppError("Invalid attachment");
  }
  return trimmed;
}

export async function withAttachmentUrl<T extends { attachmentKey?: string | null }>(
  record: T,
  requestUrl?: string,
): Promise<T & { attachmentUrl: string | null }> {
  return {
    ...record,
    attachmentUrl: await resolveAttachmentUrl(record.attachmentKey, requestUrl),
  };
}

function attachmentMacKey(): Buffer {
  const secret = process.env.JWT_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }
  return createHmac("sha256", secret).update("attachment-url-v1").digest();
}

export function signAttachmentAccess(key: string, exp: number): string {
  return createHmac("sha256", attachmentMacKey())
    .update(`${key}.${exp}`)
    .digest("base64url");
}

export function attachmentAccessValid(key: string, exp: string | undefined, sig: string | undefined): boolean {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = signAttachmentAccess(key, expNum);
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function privateFileUrl(key: string, requestUrl?: string): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const sig = signAttachmentAccess(key, exp);
  return `${apiPublicOrigin(requestUrl)}/uploads/files/${key}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export async function resolveAttachmentUrl(
  key: string | null | undefined,
  requestUrl?: string,
): Promise<string | null> {
  if (!key) return null;

  const ctx = getClient();
  if (ctx) {
    if (isProductImageKey(key) && ctx.config.publicBaseUrl) {
      const base = ctx.config.publicBaseUrl.replace(/\/$/, "");
      return `${base}/${key}`;
    }

    return getSignedUrl(
      ctx.client,
      new GetObjectCommand({
        Bucket: ctx.config.bucket,
        Key: key,
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: 60 * 60 },
    );
  }

  if (isProductImageKey(key)) {
    return `${apiPublicOrigin(requestUrl)}/uploads/files/${key}`;
  }
  return privateFileUrl(key, requestUrl);
}

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

export function sniffImageType(buffer: Buffer): { contentType: string; ext: string } | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { contentType: "image/png", ext: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", ext: "webp" };
  }
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") {
      return { contentType: "image/gif", ext: "gif" };
    }
  }
  return null;
}

export function parseImageDataUrl(dataUrl: string): {
  contentType: string;
  buffer: Buffer;
} | null {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) return null;

  try {
    const buffer = Buffer.from(match[2], "base64");
    const sniffed = sniffImageType(buffer);
    if (!sniffed) return null;
    return { contentType: sniffed.contentType, buffer };
  } catch {
    return null;
  }
}
