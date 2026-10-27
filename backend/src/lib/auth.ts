import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

export type AuthPayload = {
  sub: string;
  storeId: string;
  role: UserRole;
  tokenVersion: number;
};

function requireJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

const JWT_SECRET = requireJwtSecret();

export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({
    storeId: payload.storeId,
    role: payload.role,
    tv: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_TTL ?? "12h")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    algorithms: ["HS256"],
  });
  const sub = payload.sub;
  const storeId = payload.storeId;
  const role = payload.role;
  const tokenVersion = typeof payload.tv === "number" ? payload.tv : 0;

  if (typeof sub !== "string" || typeof storeId !== "string" || typeof role !== "string") {
    throw new Error("Invalid token payload");
  }

  return { sub, storeId, role: role as UserRole, tokenVersion };
}
