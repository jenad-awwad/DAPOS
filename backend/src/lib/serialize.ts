import { Decimal } from "@prisma/client/runtime/library";

export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_, v) => {
      if (v instanceof Decimal) {
        return v.toNumber();
      }
      return v;
    }),
  );
}
