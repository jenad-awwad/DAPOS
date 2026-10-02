export const colors = {
  background: "#F4F5F9",
  surface: "#FFFFFF",
  text: "#1E293B",
  textMuted: "#64748B",
  textLight: "#94A3B8",
  primary: "#5B4CFF",
  primarySoft: "#EEEDFF",
  green: "#22C55E",
  greenSoft: "#DCFCE7",
  orange: "#F97316",
  orangeSoft: "#FFEDD5",
  blue: "#3B82F6",
  blueSoft: "#DBEAFE",
  pink: "#EC4899",
  pinkSoft: "#FCE7F3",
  teal: "#14B8A6",
  tealSoft: "#CCFBF1",
  border: "#E2E8F0",
  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  shadow: "rgba(15, 23, 42, 0.08)",
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
};

export function roleLabel(role?: string) {
  if (role === "ADMIN") return "Administrator";
  if (role === "MANAGER") return "Manager";
  return "Cashier";
}

export function greetingForHour(hour = new Date().getHours()) {
  if (hour < 12) return "Good Morning!";
  if (hour < 17) return "Good Afternoon!";
  return "Good Evening!";
}

export function todayRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function formatShortDate(value = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function formatTimeAgo(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return formatShortDate(date);
}
