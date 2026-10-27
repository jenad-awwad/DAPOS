import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

function scryptAsync(
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_LEN = 32;

function pepperBytes(): Buffer {
  const pepper = process.env.PIN_PEPPER ?? "";
  if (pepper.length < 32) {
    throw new Error("PIN_PEPPER must be set to at least 32 characters");
  }
  return Buffer.from(pepper);
}

pepperBytes();

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hmac = createHmac("sha256", pepperBytes()).update(pin).digest();
  const hash = (await scryptAsync(hmac, salt, HASH_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Fixed hash so a missing user takes the same time as a real check. */
export const DUMMY_PIN_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (!N || !r || !p || salt.length === 0 || expected.length === 0) return false;

  const hmac = createHmac("sha256", pepperBytes()).update(pin).digest();
  const derived = (await scryptAsync(hmac, salt, expected.length, { N, r, p })) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function plainPinsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
