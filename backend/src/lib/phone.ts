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
