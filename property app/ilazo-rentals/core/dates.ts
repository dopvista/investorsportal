/**
 * Deterministic ISO-date math. All arithmetic is done on UTC calendar fields so
 * results are identical on every device regardless of timezone or DST.
 */
import type { ISODate } from './types';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseISO(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Add n calendar months, clamping the day to the target month's length (matches prototype). */
export function addMonths(iso: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(iso);
  const zero = new Date(Date.UTC(y, m - 1 + n, 1));
  const ty = zero.getUTCFullYear();
  const tm = zero.getUTCMonth() + 1;
  return toISO(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

export function addDays(iso: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days since the Unix epoch (for period-progress calculations). */
export function epochDays(iso: ISODate): number {
  const { y, m, d } = parseISO(iso);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** ISO date for the device's current local calendar day ("today" = the real current date). */
export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** '2024-10-24' → '24 Oct 2024' (en-GB style, 2-digit day, like the prototype). */
export function fmtDate(iso: ISODate): string {
  if (!iso || iso.split('-').length !== 3) return iso;
  const { y, m, d } = parseISO(iso);
  return `${String(d).padStart(2, '0')} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** '2024-10-24' → 'Oct 2024'. */
export function monthYear(iso: ISODate): string {
  const { y, m } = parseISO(iso);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/**
 * Inclusive date range label: '20 Feb – 19 May 2025'.
 * The start year is omitted when both ends fall in the same year.
 */
export function rangeStr(a: ISODate, b: ISODate): string {
  const pa = parseISO(a);
  const pb = parseISO(b);
  const sameYear = pa.y === pb.y;
  const start = `${String(pa.d).padStart(2, '0')} ${MONTHS_SHORT[pa.m - 1]}${sameYear ? '' : ` ${pa.y}`}`;
  const end = `${String(pb.d).padStart(2, '0')} ${MONTHS_SHORT[pb.m - 1]} ${pb.y}`;
  return `${start} – ${end}`;
}

export function yearOf(iso: ISODate): number {
  return parseISO(iso).y;
}
