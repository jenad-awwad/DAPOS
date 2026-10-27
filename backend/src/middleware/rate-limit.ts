import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 30;

const failures = new Map<string, number[]>();
let loggedForwardedFor = false;

/**
 * Counts failed logins per process. If the API ever runs more than one replica,
 * move this counter to the database or Redis.
 */
export function resetLoginRateLimit() {
  failures.clear();
}

function clientIp(c: Context): string {
  const header = c.req.header("x-forwarded-for");
  if (!loggedForwardedFor && process.env.RAILWAY_ENVIRONMENT) {
    console.info("X-Forwarded-For", header ?? "(missing)");
    loggedForwardedFor = true;
  }
  if (header) {
    const parts = header.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return getConnInfo(c).remote.address ?? "unknown";
}

function prune(stamps: number[], now: number): number[] {
  return stamps.filter((stamp) => now - stamp < WINDOW_MS);
}

export function noteLoginFailure(c: Context): {
  blocked: boolean;
  retryAfter: number;
} {
  const now = Date.now();
  const ip = clientIp(c);
  const stamps = prune(failures.get(ip) ?? [], now);
  stamps.push(now);
  failures.set(ip, stamps);
  if (stamps.length <= MAX_FAILURES) {
    return { blocked: false, retryAfter: 0 };
  }
  const oldest = stamps[0] ?? now;
  const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
  return { blocked: true, retryAfter };
}
