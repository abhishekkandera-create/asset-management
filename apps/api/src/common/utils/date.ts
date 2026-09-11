/**
 * Date-only helpers. `date` columns carry no time and no zone; Prisma still
 * hands them back as a Date at UTC midnight, so every conversion here goes
 * through UTC parts to avoid a local-timezone shift silently moving a day
 * (CLAUDE.md §2.7).
 */

/** `2026-09-11` -> Date at 2026-09-11T00:00:00Z, for writing a `date` column. */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date -> `2026-09-11`, for reading a `date` column back out. */
export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function formatDateOnlyOrNull(value: Date | null | undefined): string | null {
  return value ? formatDateOnly(value) : null;
}

/** Today in UTC, as a `date` value. */
export function todayUtc(): Date {
  return parseDateOnly(new Date().toISOString().slice(0, 10));
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetDay = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  // Rolling 31 Jan forward one month must land on 28/29 Feb, not 2/3 Mar.
  if (result.getUTCDate() < targetDay) {
    result.setUTCDate(0);
  }
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Whole days between two dates, floor'd. Negative when `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}
