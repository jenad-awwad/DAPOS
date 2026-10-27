import { AppError } from "./errors.js";
import {
  apiPublicOrigin,
  isSafeAttachmentKey,
  parseImageDataUrl,
  uploadProductImage,
} from "./object-storage.js";

/**
 * Product photos are stored as files (local disk or S3), never as base64 inside
 * the `products` row. The database keeps a short, host-independent path such as
 * `/uploads/files/stores/<storeId>/product-images/<uuid>.jpg`; the API turns it
 * into an absolute URL when it responds, so the deployment host can change
 * without breaking existing images. External `http(s)` URLs are stored as-is.
 */

export const PRODUCT_IMAGE_PATH_PREFIX = "/uploads/files/";
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export function isDataImageUrl(value: string): boolean {
  return value.startsWith("data:image/");
}

export function isStoredProductImagePath(value: string): boolean {
  return value.startsWith(PRODUCT_IMAGE_PATH_PREFIX);
}

/**
 * Accepts whatever the client sent for `imageUrl` and returns the value that
 * should be persisted. Base64 data URLs are written to storage and replaced by
 * their stored path; anything else is returned unchanged.
 */
export async function persistProductImage(
  imageUrl: string,
  storeId: string,
): Promise<string> {
  if (!isDataImageUrl(imageUrl)) return toStoredPath(imageUrl);

  const image = parseImageDataUrl(imageUrl);
  if (!image) {
    throw new AppError("Product photo must be a valid image");
  }
  if (image.buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new AppError("Product photo must be 5 MB or smaller");
  }

  const key = await uploadProductImage(image.buffer, image.contentType, storeId);
  return `${PRODUCT_IMAGE_PATH_PREFIX}${key}`;
}

/**
 * Clients echo back the absolute URL they were given when they edit a product
 * without changing its photo. Strip the origin so the database keeps the
 * host-independent path.
 */
function toStoredPath(imageUrl: string): string {
  if (isStoredProductImagePath(imageUrl)) return imageUrl;
  try {
    const url = new URL(imageUrl);
    if (isStoredProductImagePath(url.pathname) && isSafeAttachmentKey(url.pathname.slice(PRODUCT_IMAGE_PATH_PREFIX.length))) {
      return url.pathname;
    }
  } catch {
    /* not an absolute URL */
  }
  return imageUrl;
}

/** Converts a stored product image path into an absolute URL for the current request. */
export function resolveProductImageUrl(imageUrl: string, requestUrl?: string): string {
  if (!isStoredProductImagePath(imageUrl)) return imageUrl;
  return `${apiPublicOrigin(requestUrl)}${imageUrl}`;
}

export function withProductImageUrl<T extends { imageUrl: string }>(
  product: T,
  requestUrl?: string,
): T {
  const imageUrl = resolveProductImageUrl(product.imageUrl, requestUrl);
  return imageUrl === product.imageUrl ? product : { ...product, imageUrl };
}
