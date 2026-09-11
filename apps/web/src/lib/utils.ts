import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Dates display as `11 Sep 2026` throughout the app (CLAUDE.md §9).
 *
 * The month names are a constant rather than an Intl lookup: both en-IN and
 * en-GB abbreviate September to "Sept", four letters where every other month
 * gives three, which misaligns date columns. The spec asks for DD MMM YYYY, so
 * the app spells it out.
 */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * A `date` column value (`2026-09-11`) — rendered straight from its parts, so
 * no timezone can shift the day. A calendar date has no time and no zone;
 * putting it through a Date object only creates opportunities to lose a day.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!parts) return '—';

  const [, year, month, day] = parts;
  const name = MONTHS[Number(month) - 1];
  if (!name) return '—';
  return `${day} ${name} ${year}`;
}

/**
 * A `timestamptz` value — stored in UTC, shown in Asia/Kolkata (CLAUDE.md §2.7).
 * This one genuinely needs a timezone conversion, so Intl does the arithmetic
 * and the parts are reassembled to keep the month abbreviation consistent.
 */
const INSTANT_PARTS = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const parts = Object.fromEntries(
    INSTANT_PARTS.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const name = MONTHS[Number(parts['month']) - 1];
  if (!name) return '—';

  return `${parts['day']} ${name} ${parts['year']}, ${parts['hour']}:${parts['minute']} ${(parts['dayPeriod'] ?? '').toLowerCase()}`.trim();
}

/** Paise are stored as integers and formatted only here (CLAUDE.md §2.6). */
export function formatPaise(paise: number | bigint | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  const rupees = Number(paise) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(rupees);
}

/** `IN_STOCK` -> `In stock`, for any enum value we have not given a label to. */
export function humanise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
