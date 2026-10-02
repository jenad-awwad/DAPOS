import { Decimal } from "@prisma/client/runtime/library";

function isDecimal(value: unknown): value is Decimal {
  return Decimal.isDecimal(value);
}

function transformValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isDecimal(value)) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(transformValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, transformValue(val)]),
    );
  }
  return value;
}

export function serialize<T>(value: T): T {
  return transformValue(value) as T;
}
