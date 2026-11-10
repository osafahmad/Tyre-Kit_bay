import type { SidewallDetails } from '../../features/inspection/types';
import { KNOWN_TYRE_BRANDS } from '../../config/tyreBrands';
import { parseDotAge, parseTyreSize } from './parsers';
import { sidewallLog } from './sidewallDebug';
import type { OcrLineLike } from './textCandidates';

// Turns ML Kit lines read from a whole saved sidewall frame into candidates
// for size, DOT/TIN and make (sidewallTextFilter.ts combines them). Only text
// that was actually read is returned. Characters are never swapped, completed
// or matched to a look-alike, except the narrow CLAUDE.md exceptions marked
// below. Model is never read. Candidates are suggestions: the user confirms
// or corrects them.

export type SidewallField = keyof SidewallDetails;

/** Lines in reading order: top to bottom, then left to right. */
export function readingOrder(lines: OcrLineLike[]): OcrLineLike[] {
  return [...lines].sort((a, b) => {
    const sameRow = Math.abs(a.frame.y - b.frame.y) < Math.min(a.frame.height, b.frame.height) / 2;
    return sameRow ? a.frame.x - b.frame.x : a.frame.y - b.frame.y;
  });
}

/**
 * The word `DOT` and anything OCR put before it (stray marks or fragments),
 * as long as no letter touches `DOT` on either side. Text after it is kept
 * exactly as read.
 */
const DOT_PREFIX = /^(?:.*?[^A-Z])?DOT(?![A-Z])\s*/;

/**
 * CLAUDE.md exception (owner decision 2026-11-06): a letter `O` as the FIRST
 * character of the 4-character date code (the last 4 letters/digits) is read
 * as `0`. Weeks start with 0–5, and of those only 0 looks like O. Nothing else
 * is ever swapped, and the result must still be a valid week/year.
 */
function fixDateCodeLeadingO(text: string): string {
  const m = /O(\s?\d)(\s?\d)(\s?\d)$/.exec(text);
  if (!m) return text;
  const fixed = `${text.slice(0, m.index)}0${m[1]}${m[2]}${m[3]}`;
  sidewallLog('dot: date code leading O read as 0 (CLAUDE.md exception)', { read: text, fixed });
  return fixed;
}

/** Fewest / most letters and digits in a DOT/TIN read (date code only, up to a full 13-character TIN). */
export const DOT_MIN_CHARS = 4;
export const DOT_MAX_CHARS = 13;

/**
 * DOT/TIN: uppercase, letters, digits and single spaces, without the leading
 * `DOT`. Valid only when it ends in a real week/year date code (week 1–53,
 * not in the future) and has 4 to 13 letters and digits.
 */
export function dotCandidate(lines: OcrLineLike[], now: Date = new Date()): string | null {
  const cleaned = readingOrder(lines)
    .map(l => l.text)
    .join(' ')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const text = fixDateCodeLeadingO(cleaned.replace(DOT_PREFIX, ''));
  const chars = text.replace(/ /g, '');
  if (chars.length < DOT_MIN_CHARS || chars.length > DOT_MAX_CHARS) {
    return null;
  }
  if (!/\d{4}$/.test(chars)) {
    return null;
  }
  if (!parseDotAge(chars, now)) {
    return null;
  }
  return text;
}

/**
 * Reads compare without case, spaces or punctuation, so `MICHELIN` and
 * `Michelin.` agree.
 */
export const readKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export type FieldRead = { value: string; score: number };

type ReadGroup = { key: string; reads: FieldRead[]; total: number };

/**
 * The value read the most times, if at least `minAgreeing` reads agree.
 * Reads agree when their keys match. Ties go to the higher total score (the
 * line's text height, see sidewallTextFilter.ts). The returned text is always
 * one of the reads: the most frequent spelling, then the best-scoring one.
 */
export function agreedValue(reads: FieldRead[], minAgreeing: number): string | null {
  const groups: ReadGroup[] = [];
  for (const r of reads) {
    const key = readKey(r.value);
    const g = groups.find(x => x.key === key);
    if (g) {
      g.reads.push(r);
      g.total += r.score;
    } else groups.push({ key, reads: [r], total: r.score });
  }
  let winner: ReadGroup | null = null;
  for (const g of groups) {
    if (
      !winner ||
      g.reads.length > winner.reads.length ||
      (g.reads.length === winner.reads.length && g.total > winner.total)
    ) {
      winner = g;
    }
  }
  if (!winner || winner.reads.length < minAgreeing) return null;
  // Most frequent exact spelling (after normalisation), then best score.
  const bySpelling = new Map<string, { count: number; best: FieldRead }>();
  for (const r of winner.reads) {
    const b = bySpelling.get(r.value);
    if (!b) bySpelling.set(r.value, { count: 1, best: r });
    else {
      b.count += 1;
      if (r.score > b.best.score) b.best = r;
    }
  }
  const pick = [...bySpelling.values()].sort(
    (a, b) => b.count - a.count || b.best.score - a.best.score,
  )[0];
  return pick.best.value;
}

// ---------------------------------------------------------------- full frame

// A whole sidewall frame has lots of other text (load and pressure markings,
// rim stamps, plant codes), so only strict patterns are accepted, and model is
// never read this way.

/** Plausible tyre size ranges (mm width, aspect %, rim inches) for full-frame reads. */
export const FULL_FRAME_SIZE_LIMITS = { width: [100, 395], aspect: [20, 95], rim: [8, 26] } as const;

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

export const sizeWithinLimits = (p: { widthMm: number; aspectRatio: number; rimInches: number }) =>
  within(p.widthMm, FULL_FRAME_SIZE_LIMITS.width) &&
  within(p.aspectRatio, FULL_FRAME_SIZE_LIMITS.aspect) &&
  within(p.rimInches, FULL_FRAME_SIZE_LIMITS.rim);

/**
 * Size from a whole frame: one OCR line at a time, never joined across the
 * frame, parsed by `parseTyreSize` and within `FULL_FRAME_SIZE_LIMITS`; then
 * `recoverSize`. The first line in reading order wins; use
 * `sidewallTextFilter.ts` (`rankedSizeCandidate`) to rank several.
 */
export function fullFrameSizeCandidate(lines: OcrLineLike[]): string | null {
  for (const line of readingOrder(lines)) {
    const p = parseTyreSize(line.text);
    if (!p) continue;
    if (sizeWithinLimits(p)) return p.value;
  }
  return recoverSize(lines);
}

/**
 * Rim-gated width inference (owner decision 2026-11-06; CLAUDE.md exception).
 * When OCR read only the last two width digits (`95/55`, `A95/55`), the
 * hundreds digit is added only if the width becomes one of `widths` (so `1`
 * before 75/85/95, `2` before 05/15/25) and a rim in `rims` was read on the
 * same or adjacent line. Small rims are where 1xx/2xx confusion is least
 * likely (e.g. `85/45 R20` is almost always 285, so it is never inferred).
 */
export const SIZE_WIDTH_INFERENCE = {
  widths: [175, 185, 195, 205, 215, 225],
  rims: [13, 17],
} as const;

/** `R15`, `R 15`, `ZR15`; also `R154`, where a stray digit follows the rim. */
const RIM_TOKEN = /(?:^|[^A-Z0-9])Z?R\s?(\d{2})(?:\d)?(?!\d)/;
/** Full width/aspect read: `195/55`, `195 / 55`. */
const FULL_WIDTH_ASPECT = /(?:^|[^0-9])(\d{3})\s*\/\s*(\d{2})(?!\d)/;
/** Two-digit width read, optionally after one non-digit misread (`A95/55`, `95/55`). */
const SHORT_WIDTH_ASPECT = /(?:^|[^0-9])(\d{2})\s*\/\s*(\d{2})(?!\d)/;

/**
 * Size from separate pieces, all read by OCR:
 * 1. a full width/aspect (`195/55`) plus a rim token (`R15`) on the same or the
 *    next/previous line, joined;
 * 2. else, `SIZE_WIDTH_INFERENCE`: a two-digit width (`95/55`) with a rim in
 *    13–17 nearby, completed only to a width in 175–225.
 * Every result must parse and be within `FULL_FRAME_SIZE_LIMITS`.
 */
export function recoverSize(lines: OcrLineLike[]): string | null {
  const ordered = readingOrder(lines).map(l => l.text.toUpperCase());
  const rimNear = (i: number): number | null => {
    for (const j of [i, i + 1, i - 1]) {
      const text = ordered[j];
      if (text === undefined) continue;
      // On the width's own line, look only after the aspect ratio.
      const m = RIM_TOKEN.exec(j === i ? text.replace(/^.*?\/\s*\d{2}/, ' ') : text);
      if (m) return Number(m[1]);
    }
    return null;
  };
  for (let i = 0; i < ordered.length; i++) {
    const full = FULL_WIDTH_ASPECT.exec(ordered[i]);
    if (!full) continue;
    const rim = rimNear(i);
    if (rim === null) continue;
    const p = parseTyreSize(`${full[1]}/${full[2]} R${rim}`);
    if (p && sizeWithinLimits(p)) {
      sidewallLog('size recovered: width/aspect joined with a nearby rim', { lines: ordered, size: p.value });
      return p.value;
    }
  }
  for (let i = 0; i < ordered.length; i++) {
    if (FULL_WIDTH_ASPECT.test(ordered[i])) continue;
    const short = SHORT_WIDTH_ASPECT.exec(ordered[i]);
    if (!short) continue;
    const rim = rimNear(i);
    const [minRim, maxRim] = SIZE_WIDTH_INFERENCE.rims;
    if (rim === null || rim < minRim || rim > maxRim) {
      continue;
    }
    const width = (SIZE_WIDTH_INFERENCE.widths as readonly number[]).find(w => w % 100 === Number(short[1]));
    if (width === undefined) {
      continue;
    }
    const p = parseTyreSize(`${width}/${short[2]} R${rim}`);
    if (p && sizeWithinLimits(p)) {
      sidewallLog('size recovered: width hundreds digit inferred (rim-gated, CLAUDE.md exception)', {
        read: ordered[i],
        rim,
        size: p.value,
      });
      return p.value;
    }
  }
  return null;
}

/** Fewest letters and digits after `DOT` in a full-frame read: a whole TIN, not a lone number. */
export const FULL_FRAME_DOT_MIN_CHARS = 8;

/** `DOT` as a word anywhere in a line: no letter directly before or after it. */
const DOT_WORD = /(?:^|[^A-Z])DOT(?![A-Z])/;

/**
 * DOT/TIN from a whole frame: a line must contain the word `DOT` (anything
 * before it is dropped). That line
 * alone, or joined with the next line in reading order (TINs often wrap), must
 * give 8–13 letters and digits after `DOT`, ending in a valid date code.
 */
export function fullFrameDotCandidate(lines: OcrLineLike[], now: Date = new Date()): string | null {
  const ordered = readingOrder(lines);
  for (let i = 0; i < ordered.length; i++) {
    if (!DOT_WORD.test(ordered[i].text.toUpperCase())) continue;
    const tries = [[ordered[i]], ...(ordered[i + 1] ? [[ordered[i], ordered[i + 1]]] : [])];
    for (const group of tries) {
      const value = dotCandidate(group, now);
      if (value && value.replace(/ /g, '').length >= FULL_FRAME_DOT_MIN_CHARS) return value;
    }
  }
  return null;
}

/** Brand names as whole-word, case- and spacing-insensitive patterns. */
const BRAND_PATTERNS = KNOWN_TYRE_BRANDS.map(brand => ({
  brand,
  re: new RegExp(`(?:^|[^A-Z0-9])(${brand.toUpperCase().split(/\s+/).join('\\s*')})(?![A-Z0-9])`),
}));

/**
 * Make from a whole frame: a line containing a known brand name exactly, as a
 * whole word. Returns the matched text as OCR read it (case kept). Fragments
 * and look-alikes never match; model names are not read from a whole frame.
 */
export function fullFrameMakeCandidate(lines: OcrLineLike[]): string | null {
  for (const line of [...lines].sort((a, b) => b.frame.height - a.frame.height)) {
    const upper = line.text.toUpperCase();
    for (const { re } of BRAND_PATTERNS) {
      const m = re.exec(upper);
      if (m) {
        const start = m.index + m[0].length - m[1].length;
        return line.text.slice(start, start + m[1].length).replace(/\s+/g, ' ');
      }
    }
  }
  return null;
}
