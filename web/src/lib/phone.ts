export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function phoneLocalKey(phone: string): string {
  const digits = phoneDigits(phone);
  if (digits.startsWith("972")) return digits.slice(3);
  return digits.replace(/^0/, "");
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = phoneLocalKey(a);
  const right = phoneLocalKey(b);
  return left.length >= 7 && left === right;
}

export function customerNamesMatch(a: string, b: string): boolean {
  const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

export function phoneMatchesSearch(stored: string, query: string): boolean {
  const storedDigits = phoneDigits(stored);
  const queryDigits = phoneDigits(query);
  if (!queryDigits) return false;
  if (storedDigits.includes(queryDigits)) return true;

  let queryLocal = queryDigits;
  if (queryLocal.startsWith("972")) queryLocal = queryLocal.slice(3);
  else if (queryLocal.startsWith("0")) queryLocal = queryLocal.slice(1);
  if (queryLocal.length < 2) return false;

  return phoneLocalKey(stored).includes(queryLocal);
}
