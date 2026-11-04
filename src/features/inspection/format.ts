import type { TyreResult } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** "Today, 11:40", "Yesterday, 16:20", "2 Nov, 10:05". */
export function formatRelativeDateTime(date: Date, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  const day =
    days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return `${day}, ${formatTime(date)}`;
}

/** "3 Nov, 16:20" (History rows in the Earlier group). */
export function formatShortDateTime(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${formatTime(date)}`;
}

/** "4 Nov 2026, 11:40" (report header). */
export function formatLongDateTime(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${formatTime(date)}`;
}

export function formatTyreCount(n: number): string {
  return n === 1 ? '1 tyre' : `${n} tyres`;
}

export function formatDepth(mm: number): string {
  return `${mm.toFixed(1)} mm`;
}

export function formatAge(result: Pick<TyreResult, 'ageYears' | 'ageMonths'>): string | null {
  const { ageYears, ageMonths } = result;
  if (ageYears === null || ageMonths === null) return null;
  const y = ageYears === 1 ? '1 year' : `${ageYears} years`;
  const m = ageMonths === 1 ? '1 month' : `${ageMonths} months`;
  if (ageYears === 0) return m;
  if (ageMonths === 0) return y;
  return `${y} ${m}`;
}

export function formatRim(inches: number | null): string | null {
  return inches === null ? null : `${inches} inches`;
}

export function formatDamage(found: boolean | null): string | null {
  return found === null ? null : found ? 'Found' : 'None found';
}

/** "6.2 mm · 215/65 R15", leaving out parts that weren't read. */
export function tyreDetailLine(result: TyreResult | null): string {
  if (!result) return '';
  return [result.treadDepthMm !== null ? formatDepth(result.treadDepthMm) : null, result.size]
    .filter(Boolean)
    .join(' · ');
}
