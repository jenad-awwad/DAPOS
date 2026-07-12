import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

export type AuthPayload = {
  sub: string;
  storeId: string;
  role: UserRole;
};

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dapos-dev-secret-change-me",
);

export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({ storeId: payload.storeId, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  const sub = payload.sub;
  const storeId = payload.storeId;
  const role = payload.role;

  if (typeof sub !== "string" || typeof storeId !== "string" || typeof role !== "string") {
    throw new Error("Invalid token payload");
  }

  return { sub, storeId, role: role as UserRole };
}
