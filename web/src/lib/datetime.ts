/** Build an ISO datetime from separate date (YYYY-MM-DD) and time (HH:MM or HH:MM:SS) inputs. */
export function localDateTimeToIso(date: string, time: string): string {
  if (!date?.trim()) {
    throw new Error("Date is required");
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  if (
    [year, month, day, hours, minutes].some((part) => Number.isNaN(part)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("Invalid date or time");
  }

  const value = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid date or time");
  }

  return value.toISOString();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DD` in the browser's local timezone, for a date input. */
export function isoToLocalDateInput(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `HH:MM` in the browser's local timezone, for a time input. */
export function isoToLocalTimeInput(value: string): string {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
