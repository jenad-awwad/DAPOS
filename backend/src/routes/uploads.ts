import { Hono } from "hono";
import { z } from "zod";
import {
  isProductImageKey,
  isRemoteStorageConfigured,
  isSafeAttachmentKey,
  parseImageDataUrl,
  readLocalAttachment,
  resolveAttachmentUrl,
  uploadVendorAttachment,
} from "../lib/object-storage.js";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { requireAnyPermission } from "../middleware/permissions.js";

export const uploadRoutes = new Hono<AppEnv>();

const vendorAttachmentSchema = z.object({
  imageDataUrl: z.string().min(32).max(6_000_000),
});

uploadRoutes.get("/files/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const key = decodeURIComponent(pathname.replace(/^\/uploads\/files\//, ""));
  if (!isSafeAttachmentKey(key)) {
    return c.json({ error: "File not found" }, 404);
  }

  // Stored paths are stable (`/uploads/files/<key>`) regardless of where the
  // bytes live. With S3 configured, hand the browser the real object URL.
  if (isRemoteStorageConfigured()) {
    const target = await resolveAttachmentUrl(key, c.req.url);
    return c.redirect(target ?? "", 302);
  }

  const file = await readLocalAttachment(key);
  if (!file) {
    return c.json({ error: "File not found" }, 404);
  }

  // Keys are random UUIDs and never rewritten, so product images can be cached hard.
  const cacheControl = isProductImageKey(key)
    ? "public, max-age=31536000, immutable"
    : "private, max-age=86400";

  return c.body(new Uint8Array(file.buffer), 200, {
    "Content-Type": file.contentType,
    "Cache-Control": cacheControl,
  });
});

uploadRoutes.post(
  "/attachment",
  requireAuth,
  requireAnyPermission(
    "pos.projects",
    "calendar.manage",
    "vendors.record",
    "vendors.manage",
  ),
  async (c) => {
    const { storeId } = c.get("auth");
    const body = await c.req.json().catch(() => null);
    const parsed = vendorAttachmentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid image upload" }, 400);
    }

    const image = parseImageDataUrl(parsed.data.imageDataUrl);
    if (!image) {
      return c.json({ error: "Image must be a base64 data URL" }, 400);
    }

    if (image.buffer.length > 5 * 1024 * 1024) {
      return c.json({ error: "Image must be 5 MB or smaller" }, 400);
    }

    try {
      const key = await uploadVendorAttachment(
        image.buffer,
        image.contentType,
        storeId,
      );
      return c.json({ key }, 201);
    } catch (err) {
      console.error(err);
      return c.json({ error: "Upload failed" }, 500);
    }
  },
);

uploadRoutes.post(
  "/vendor-attachment",
  requireAuth,
  requireAnyPermission("vendors.record", "vendors.manage"),
  async (c) => {
    const { storeId } = c.get("auth");
    const body = await c.req.json().catch(() => null);
    const parsed = vendorAttachmentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid image upload" }, 400);
    }

    const image = parseImageDataUrl(parsed.data.imageDataUrl);
    if (!image) {
      return c.json({ error: "Image must be a base64 data URL" }, 400);
    }

    if (image.buffer.length > 5 * 1024 * 1024) {
      return c.json({ error: "Image must be 5 MB or smaller" }, 400);
    }

    try {
      const key = await uploadVendorAttachment(
        image.buffer,
        image.contentType,
        storeId,
      );
      return c.json({ key }, 201);
    } catch (err) {
      console.error(err);
      return c.json({ error: "Upload failed" }, 500);
    }
  },
);
