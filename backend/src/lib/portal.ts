import { readFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../../public");

const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentType(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : "";
  return types[ext] ?? "application/octet-stream";
}

function resolvePublicFile(requestPath: string): string | null {
  let relative: string;
  try {
    relative = decodeURIComponent(requestPath).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (!relative || relative.includes("\0") || relative.includes("..")) return null;
  const resolved = normalize(join(publicDir, relative));
  const root = normalize(publicDir + sep);
  if (resolved !== normalize(publicDir) && !resolved.startsWith(root)) return null;
  return resolved;
}

function asBody(data: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  return bytes;
}

let indexHtml: Uint8Array<ArrayBuffer> | null | undefined;

async function readIndex(): Promise<Uint8Array<ArrayBuffer> | null> {
  if (indexHtml !== undefined) return indexHtml;
  try {
    indexHtml = asBody(await readFile(join(publicDir, "index.html")));
  } catch {
    indexHtml = null;
  }
  return indexHtml;
}

/** Browser page loads should get the portal. API fetches do not ask for HTML. */
function wantsPage(accept: string | undefined, path: string): boolean {
  if (path === "/") return true;
  return (accept ?? "").includes("text/html");
}

export function mountPortalPages(app: Hono<AppEnv>) {
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const path = c.req.path;
    if (path.startsWith("/uploads/") || path === "/health") return next();
    if (!wantsPage(c.req.header("accept"), path)) return next();
    const html = await readIndex();
    if (!html) return next();
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  });
}

export function mountPortalAssets(app: Hono<AppEnv>) {
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const path = c.req.path;
    if (path === "/" || path.endsWith("/")) return next();
    const filePath = resolvePublicFile(path);
    if (!filePath) return next();
    try {
      const body = asBody(await readFile(filePath));
      const cache = path.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": contentType(filePath),
          "Cache-Control": cache,
        },
      });
    } catch {
      return next();
    }
  });
}
