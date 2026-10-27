import { Prisma } from "@prisma/client";
import type { Context } from "hono";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500;

export function errorResponse(c: Context, error: unknown, _fallback: string) {
  if (error instanceof AppError) {
    return c.json({ error: error.message }, error.status as ErrorStatus);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return c.json({ error: "Already exists" }, 409);
    }
    if (error.code === "P2025") {
      return c.json({ error: "Not found" }, 404);
    }
  }

  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
}
