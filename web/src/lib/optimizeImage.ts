/**
 * Prepares a camera or gallery photo for upload.
 * The longest side is at most 1200px, the aspect ratio is unchanged, and the
 * file is WebP at about 80% quality, aiming for 300 KB when that does not
 * require a heavy quality drop.
 */

export const MAX_IMAGE_EDGE = 1200;
export const TARGET_IMAGE_BYTES = 300 * 1024;
const START_QUALITY = 0.8;
const MIN_QUALITY = 0.6;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export type OptimizedImage = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
};

export type OptimizeProgress = (percent: number, label: string) => void;

type DecodedPhoto = {
  bitmap: ImageBitmap;
  /** EXIF orientation still to apply. 1 means the bitmap is already upright. */
  orientation: number;
  width: number;
  height: number;
};

export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("This photo has no visible size.");
  }
  const scale = Math.min(1, maxEdge / width, maxEdge / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function formatPhotoSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function readJpegOrientation(bytes: Uint8Array): number {
  const value = orientationInJpeg(bytes);
  return value >= 1 && value <= 8 ? value : 1;
}

export function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2 || offset + 2 + size > bytes.length) return null;
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width > 0 && height > 0) return { width, height };
    }
    offset += 2 + size;
  }
  return null;
}

export async function optimizeImageFile(
  file: File,
  onProgress?: OptimizeProgress,
): Promise<OptimizedImage> {
  if (!isImageFile(file)) {
    throw new Error("Please choose an image file.");
  }
  if (file.size === 0) {
    throw new Error("The photo file is empty. Take the picture again.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("This photo is too large to process. Choose one under 25 MB.");
  }

  onProgress?.(8, "Reading photo…");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const exifOrientation = readJpegOrientation(bytes);
  const sensorSize = readJpegSize(bytes);
  onProgress?.(22, "Reading photo…");

  const decoded = await decodePhoto(file, exifOrientation, sensorSize);
  try {
    onProgress?.(42, "Resizing photo…");
    const fitted = fitWithin(decoded.width, decoded.height);
    onProgress?.(58, "Compressing photo…");
    const compressed = await compressToTarget(
      (width, height) => drawPhoto(decoded, width, height),
      fitted.width,
      fitted.height,
      (fraction) => onProgress?.(58 + Math.round(fraction * 34), "Compressing photo…"),
    );
    onProgress?.(94, "Preparing preview…");
    const dataUrl = await blobToDataUrl(compressed.blob);
    if (!dataUrl.startsWith("data:image/webp")) {
      throw new Error("This browser could not save the photo as WebP. Update the browser and try again.");
    }
    if (dataUrl.length > 2_500_000) {
      throw new Error("This photo is still too large after compression. Try another picture.");
    }
    onProgress?.(100, "Ready to review");
    return {
      dataUrl,
      width: compressed.width,
      height: compressed.height,
      bytes: compressed.blob.size,
    };
  } finally {
    decoded.bitmap.close();
  }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return !file.type && /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/i.test(file.name);
}

async function decodePhoto(
  file: File,
  exifOrientation: number,
  sensorSize: { width: number; height: number } | null,
): Promise<DecodedPhoto> {
  const bitmap = await decodeBitmap(file, "from-image");
  const upright = {
    bitmap,
    orientation: 1,
    width: bitmap.width,
    height: bitmap.height,
  };
  if (exifOrientation === 1 || !sensorSize) return upright;

  const needsSwap = exifOrientation >= 5 && exifOrientation <= 8;
  const matchesSensor =
    Math.abs(bitmap.width - sensorSize.width) <= 2 &&
    Math.abs(bitmap.height - sensorSize.height) <= 2;
  const matchesUpright =
    Math.abs(bitmap.width - sensorSize.height) <= 2 &&
    Math.abs(bitmap.height - sensorSize.width) <= 2;

  if (needsSwap && matchesSensor && !matchesUpright) {
    return {
      bitmap,
      orientation: exifOrientation,
      width: sensorSize.height,
      height: sensorSize.width,
    };
  }
  if (!needsSwap && matchesSensor) {
    const ignored = await orientationWasIgnored(file, bitmap);
    if (ignored) {
      return {
        bitmap,
        orientation: exifOrientation,
        width: sensorSize.width,
        height: sensorSize.height,
      };
    }
  }
  return upright;
}

async function orientationWasIgnored(file: File, oriented: ImageBitmap): Promise<boolean> {
  let raw: ImageBitmap;
  try {
    raw = await decodeBitmap(file, "none");
  } catch {
    return false;
  }
  try {
    if (raw.width !== oriented.width || raw.height !== oriented.height) return false;
    return samplesMatch(raw, oriented);
  } finally {
    raw.close();
  }
}

async function decodeBitmap(file: File, orientation: "from-image" | "none"): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: orientation });
  } catch (error) {
    if (orientation === "none") throw error;
    try {
      return await createImageBitmap(file);
    } catch {
      throw new Error(
        "This photo could not be read. Take it again, or choose a JPEG or PNG from your gallery.",
      );
    }
  }
}

function samplesMatch(left: ImageBitmap, right: ImageBitmap): boolean {
  const a = sampleBitmap(left);
  const b = sampleBitmap(right);
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i] - b[i]) > 12) return false;
  }
  return true;
}

function sampleBitmap(bitmap: ImageBitmap): Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, 8, 8);
  try {
    return ctx.getImageData(0, 0, 8, 8).data;
  } catch {
    return null;
  }
}

function drawPhoto(photo: DecodedPhoto, targetWidth: number, targetHeight: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare this photo.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const scaleX = targetWidth / photo.width;
  const scaleY = targetHeight / photo.height;
  const [a, b, c, d, e, f] = orientationMatrix(photo.orientation, photo.bitmap.width, photo.bitmap.height);
  ctx.setTransform(a * scaleX, b * scaleY, c * scaleX, d * scaleY, e * scaleX, f * scaleY);
  ctx.drawImage(photo.bitmap, 0, 0);
  return canvas;
}

function orientationMatrix(
  orientation: number,
  srcWidth: number,
  srcHeight: number,
): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2:
      return [-1, 0, 0, 1, srcWidth, 0];
    case 3:
      return [-1, 0, 0, -1, srcWidth, srcHeight];
    case 4:
      return [1, 0, 0, -1, 0, srcHeight];
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, 1, -1, 0, srcHeight, 0];
    case 7:
      return [0, -1, -1, 0, srcHeight, srcWidth];
    case 8:
      return [0, -1, 1, 0, 0, srcWidth];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

async function compressToTarget(
  draw: (width: number, height: number) => HTMLCanvasElement,
  width: number,
  height: number,
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; width: number; height: number }> {
  let currentWidth = width;
  let currentHeight = height;
  let canvas = draw(currentWidth, currentHeight);
  let quality = START_QUALITY;
  let blob = await encodeWebp(canvas, quality);
  let steps = 0;
  const tick = () => {
    steps += 1;
    onProgress(Math.min(1, steps / 8));
  };
  tick();

  while (blob.size > TARGET_IMAGE_BYTES && quality > MIN_QUALITY + 0.001) {
    quality = Math.round((quality - 0.05) * 100) / 100;
    blob = await encodeWebp(canvas, quality);
    tick();
  }

  let shrink = 1;
  while (blob.size > TARGET_IMAGE_BYTES && shrink > 0.55) {
    shrink = Math.round((shrink - 0.1) * 100) / 100;
    const nextWidth = Math.max(1, Math.round(width * shrink));
    const nextHeight = Math.max(1, Math.round(height * shrink));
    if (nextWidth === currentWidth && nextHeight === currentHeight) break;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
    canvas = draw(currentWidth, currentHeight);
    blob = await encodeWebp(canvas, Math.max(quality, MIN_QUALITY));
    tick();
  }

  if (!(await isWebp(blob))) {
    throw new Error("This browser could not save the photo as WebP. Update the browser and try again.");
  }
  return { blob, width: currentWidth, height: currentHeight };
}

function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress this photo. Try another picture."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

async function isWebp(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (head.length < 12) return false;
  const riff = String.fromCharCode(head[0], head[1], head[2], head[3]);
  const webp = String.fromCharCode(head[8], head[9], head[10], head[11]);
  return riff === "RIFF" && webp === "WEBP";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not prepare this photo for upload."));
    reader.readAsDataURL(blob);
  });
}

function orientationInJpeg(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2 || offset + 2 + size > bytes.length) return 1;
    if (marker === 0xe1) {
      const orientation = orientationInExif(bytes.subarray(offset + 4, offset + 2 + size));
      if (orientation) return orientation;
    }
    offset += 2 + size;
  }
  return 1;
}

function orientationInExif(segment: Uint8Array): number | null {
  if (segment.length < 14) return null;
  if (
    segment[0] !== 0x45 ||
    segment[1] !== 0x78 ||
    segment[2] !== 0x69 ||
    segment[3] !== 0x66 ||
    segment[4] !== 0 ||
    segment[5] !== 0
  ) {
    return null;
  }
  const tiff = 6;
  const little = segment[tiff] === 0x49 && segment[tiff + 1] === 0x49;
  const big = segment[tiff] === 0x4d && segment[tiff + 1] === 0x4d;
  if (!little && !big) return null;
  if (readUint16(segment, tiff + 2, little) !== 0x002a) return null;
  const ifdOffset = readUint32(segment, tiff + 4, little);
  return orientationInIfd(segment, tiff + ifdOffset, little);
}

function orientationInIfd(segment: Uint8Array, offset: number, little: boolean): number | null {
  if (offset < 0 || offset + 2 > segment.length) return null;
  const count = readUint16(segment, offset, little);
  for (let i = 0; i < count; i += 1) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > segment.length) return null;
    if (readUint16(segment, entry, little) !== 0x0112) continue;
    const value = readUint16(segment, entry + 8, little);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

function readUint16(bytes: Uint8Array, offset: number, little: boolean): number {
  if (offset + 2 > bytes.length) return 0;
  return little ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, little: boolean): number {
  if (offset + 4 > bytes.length) return 0;
  const value = little
    ? bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    : (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
  return value >>> 0;
}
