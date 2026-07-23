const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for strings shaped like YYYY-MM-DD that are also real calendar
 * dates (rejects things like 2026-02-30 or 2026-13-45, which pass the shape
 * regex but fail to construct a valid date).
 */
export function isValidDigestDate(value: string): boolean {
  if (!DATE_SHAPE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
