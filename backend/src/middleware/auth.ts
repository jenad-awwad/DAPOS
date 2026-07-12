import { createMiddleware } from "hono/factory";
import { verifyToken, type AuthPayload } from "../lib/auth.js";

export type AppEnv = {
  Variables: {
    auth: AuthPayload;
  };
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const auth = await verifyToken(header.slice(7));
    c.set("auth", auth);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
