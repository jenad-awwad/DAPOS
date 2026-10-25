import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const LOCAL_UPLOAD_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../uploads",
);

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

export function isObjectStorageConfigured(): boolean {
  return true;
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
  const resolved = normalize(join(LOCAL_UPLOAD_ROOT, key));
  const root = normalize(LOCAL_UPLOAD_ROOT + sep);
  if (!resolved.startsWith(root) && resolved !== normalize(LOCAL_UPLOAD_ROOT)) {
    throw new Error("Invalid attachment path");
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
    throw new Error("Invalid attachment");
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

export async function resolveAttachmentUrl(
  key: string | null | undefined,
  requestUrl?: string,
): Promise<string | null> {
  if (!key) return null;

  const ctx = getClient();
  if (ctx) {
    if (ctx.config.publicBaseUrl) {
      const base = ctx.config.publicBaseUrl.replace(/\/$/, "");
      return `${base}/${key}`;
    }

    return getSignedUrl(
      ctx.client,
      new GetObjectCommand({
        Bucket: ctx.config.bucket,
        Key: key,
      }),
      { expiresIn: 60 * 60 },
    );
  }

  return `${apiPublicOrigin(requestUrl)}/uploads/files/${key}`;
}

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

export function parseImageDataUrl(dataUrl: string): {
  contentType: string;
  buffer: Buffer;
} | null {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) return null;

  try {
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length === 0) return null;
    return { contentType: match[1], buffer };
  } catch {
    return null;
  }
}
