export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function phoneCandidates(raw: string): string[] {
  const digits = normalizePhone(raw);
  const candidates = new Set<string>([digits]);

  if (digits.startsWith("972")) {
    candidates.add(`0${digits.slice(3)}`);
  }
  if (digits.startsWith("0")) {
    candidates.add(`972${digits.slice(1)}`);
  }

  return [...candidates];
}

export function phoneLookupValues(raw: string): string[] {
  const trimmed = raw.trim();
  return [...new Set([trimmed, ...phoneCandidates(trimmed)].filter((value) => value.length > 0))];
}

export function phoneLocalKey(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.startsWith("972")) return digits.slice(3);
  return digits.replace(/^0/, "");
}

export function phonesEquivalent(a: string, b: string): boolean {
  const left = phoneLocalKey(a);
  const right = phoneLocalKey(b);
  return left.length >= 7 && left === right;
}

export function customerNamesMatch(a: string, b: string): boolean {
  const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

export function phoneTakenMessage(name: string): string {
  return `This number belongs to ${name}`;
}
