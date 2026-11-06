import type { SidewallDetails } from '../../features/inspection/types';
import { KNOWN_TYRE_BRANDS } from '../../config/tyreBrands';
import { parseDotAge, parseTyreSize } from './parsers';
import { sidewallLog } from './sidewallDebug';
import type { OcrLineLike } from './textCandidates';

// Turns OCR lines read from one detected sidewall region into a candidate for
// one field. Only text that was actually read is returned: characters are
// never swapped (O/0, I/1, S/5…), completed or matched to a brand list.
// Candidates are suggestions; the user confirms or corrects them.

export type SidewallField = keyof SidewallDetails;

/** Detector label → the field its text belongs to. Unknown labels are ignored. */
export const FIELD_BY_LABEL: Readonly<Record<string, SidewallField>> = {
  Brand: 'make',
  'Dot-Code': 'dotTin',
  Model: 'model',
  Size: 'size',
};

/** Lines in reading order: top to bottom, then left to right. */
function readingOrder(lines: OcrLineLike[]): OcrLineLike[] {
  return [...lines].sort((a, b) => {
    const sameRow = Math.abs(a.frame.y - b.frame.y) < Math.min(a.frame.height, b.frame.height) / 2;
    return sameRow ? a.frame.x - b.frame.x : a.frame.y - b.frame.y;
  });
}

/** Size: the existing tyre size parser, on each line and then on all lines joined. */
export function sizeCandidate(lines: OcrLineLike[]): string | null {
  const ordered = readingOrder(lines);
  for (const line of ordered) {
    const parsed = parseTyreSize(line.text);
    if (parsed) return parsed.value;
  }
  const joined = ordered.map(l => l.text).join(' ');
  const parsed = parseTyreSize(joined);
  if (parsed) return parsed.value;
  return recoverSize(lines);
}

/**
 * The word `DOT` and anything OCR put before it (stray marks or fragments),
 * as long as no letter touches `DOT` on either side. Text after it is kept
 * exactly as read.
 */
const DOT_PREFIX = /^(?:.*?[^A-Z])?DOT(?![A-Z])\s*/;

/**
 * Crop only: the DOT marker at the very start of a `Dot-Code` crop, as OCR
 * often misreads it (`D0T`, `DQT`, `D07`, `1D0T`), even when glued to the
 * TIN. The marker is dropped; it is never part of the value.
 */
const CROP_DOT_MARKER = /^[^A-Z0-9]*1?D[O0Q][T7]\s*/;

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
export function dotCandidate(
  lines: OcrLineLike[],
  now: Date = new Date(),
  /** `crop`: a detector Dot-Code crop, where misread DOT markers are dropped too. */
  mode: 'crop' | 'fullFrame' = 'fullFrame',
): string | null {
  const cleaned = readingOrder(lines)
    .map(l => l.text)
    .join(' ')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const unmarked =
    mode === 'crop' && CROP_DOT_MARKER.test(cleaned)
      ? cleaned.replace(CROP_DOT_MARKER, '')
      : cleaned.replace(DOT_PREFIX, '');
  const text = fixDateCodeLeadingO(unmarked);
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
 * OCR noise clean-up for names: trims punctuation and symbols at the ends
 * (`Primacy 4.` → `Primacy 4`, `-MICHELIN-` → `MICHELIN`) and collapses spaces.
 * Letters and digits are never changed.
 */
export function cleanOcrText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9\u00C0-\u024F]+|[^A-Za-z0-9\u00C0-\u024F]+$/g, '')
    .trim();
}

/**
 * Make / Model: the most prominent line (tallest text) with at least two
 * letters, as read after `cleanOcrText`. 2 to 30 characters.
 */
export function nameCandidate(lines: OcrLineLike[]): string | null {
  const usable = lines
    .map(l => ({ line: l, text: cleanOcrText(l.text) }))
    .filter(({ text }) => (text.match(/[A-Za-z]/g)?.length ?? 0) >= 2 && text.length <= 30);
  if (usable.length === 0) {
    return null;
  }
  usable.sort((a, b) => b.line.frame.height - a.line.frame.height);
  return usable[0].text;
}

/** Brands this long or longer may match with one OCR error (Levenshtein 1). */
export const BRAND_FUZZY_MIN_LENGTH = 6;

/**
 * Make inside a detector `Brand` crop (CLAUDE.md exception, owner decision
 * 2026-11-06). Returns the canonical name from `tyreBrands.ts` when:
 * 1. a cleaned line contains a brand name (letters/digits only, any case), or
 * 2. a word, or two adjacent words, is within Levenshtein 1 of exactly one
 *    brand of 6+ letters (and no other brand is as close).
 * 3. logo fragments clearly from one brand (`brandFromFragments`).
 * Otherwise nothing: a read that isn't a recognised brand is never suggested
 * (owner decision 2026-11-06), so an unlisted brand is typed by the user.
 */
export function brandCandidate(
  lines: OcrLineLike[],
  brands: readonly string[] = KNOWN_TYRE_BRANDS,
): string | null {
  const keys = brands.map(b => ({ brand: b, key: readKey(b) }));
  const ordered = [...lines].sort((a, b) => b.frame.height - a.frame.height);
  for (const line of ordered) {
    const lineKey = readKey(line.text);
    const hit = keys
      .filter(k => k.key.length >= 3 && lineKey.includes(k.key))
      .sort((a, b) => b.key.length - a.key.length)[0];
    if (hit) {
      sidewallLog('brand matched (contains)', { read: line.text, brand: hit.brand });
      return hit.brand;
    }
  }
  for (const line of ordered) {
    const words = cleanOcrText(line.text).split(' ').filter(Boolean);
    const tries = [...words, ...words.slice(1).map((w, i) => `${words[i]}${w}`)];
    for (const word of tries) {
      const wk = readKey(word);
      const scored = keys
        .filter(k => k.key.length >= BRAND_FUZZY_MIN_LENGTH)
        .map(k => ({ ...k, d: levenshtein(wk, k.key) }))
        .filter(k => k.d <= 1)
        .sort((a, b) => a.d - b.d);
      if (scored.length === 1 || (scored.length > 1 && scored[0].d < scored[1].d)) {
        sidewallLog('brand matched (1 OCR error)', { read: word, brand: scored[0].brand });
        return scored[0].brand;
      }
    }
  }
  const fragment = brandFromFragments(ordered, keys);
  if (fragment) return fragment;
  return null;
}

/** Longest common subsequence length (letters in order, gaps allowed). */
export function lcsLength(a: string, b: string): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Fragment matching thresholds (Brand crop only). */
export const BRAND_FRAGMENT = {
  /** Shortest read considered, letters and digits. */
  minReadLength: 5,
  /** Share of the read's letters that must appear, in order, in the brand. */
  minReadCoverage: 0.8,
  /** Share of the brand's letters the read must cover. */
  minBrandCoverage: 0.4,
} as const;

/**
 * Logo fragments (owner decision 2026-11-06): a stylised brand logo often
 * reads as pieces like `Ontnem` or `TLenta` for Continental. A line matches a
 * brand when most of its letters (≥ 80%) appear in order in that brand, cover
 * enough of it (≥ 40%), and it is the ONLY brand that passes both, with more
 * matched letters than any other brand. Short or ambiguous reads match nothing.
 */
function brandFromFragments(
  lines: OcrLineLike[],
  keys: { brand: string; key: string }[],
): string | null {
  for (const line of lines) {
    const read = readKey(line.text);
    if (read.length < BRAND_FRAGMENT.minReadLength) continue;
    const scored = keys
      .map(k => ({ ...k, lcs: lcsLength(read, k.key) }))
      .sort((a, b) => b.lcs - a.lcs);
    const passing = scored.filter(
      k =>
        k.lcs >= BRAND_FRAGMENT.minReadCoverage * read.length &&
        k.lcs >= BRAND_FRAGMENT.minBrandCoverage * k.key.length,
    );
    const [best, next] = scored;
    if (passing.length === 1 && passing[0] === best && best.lcs > (next?.lcs ?? 0)) {
      sidewallLog('brand matched (logo fragment)', { read: line.text, brand: best.brand, matched: best.lcs });
      return best.brand;
    }
  }
  return null;
}

export function fieldCandidate(
  field: SidewallField,
  lines: OcrLineLike[],
  now: Date = new Date(),
): string | null {
  if (lines.length === 0) return null;
  switch (field) {
    case 'size':
      return sizeCandidate(lines);
    case 'dotTin':
      return dotCandidate(lines, now, 'crop');
    case 'make':
      return brandCandidate(lines);
    case 'model':
      return nameCandidate(lines);
  }
}

/**
 * Reads compare without case, spaces or punctuation, so `MICHELIN` and
 * `Michelin.` agree.
 */
export const readKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export type FieldRead = { value: string; score: number };

/** Edit distance (insertions, deletions, substitutions). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Model reads that count as the same value for agreement: within edit
 * distance 2 (1 for keys under 6 characters), and with exactly the same
 * digits, so `Primacy 3` and `Primacy 4` never merge.
 */
export function nearSameModel(a: string, b: string): boolean {
  const ka = readKey(a);
  const kb = readKey(b);
  if (ka.replace(/\D/g, '') !== kb.replace(/\D/g, '')) return false;
  const maxDistance = Math.min(ka.length, kb.length) < 6 ? 1 : 2;
  return levenshtein(ka, kb) <= maxDistance;
}

type ReadGroup = { key: string; reads: FieldRead[]; total: number };

/**
 * The value read the most times, if at least `minAgreeing` reads agree.
 * Reads agree when their keys match, or when `similar` says so (model only).
 * Ties go to the higher total detector score. The returned text is always one
 * of the reads: the most frequent spelling in the winning group, then the
 * best-scoring one.
 */
export function agreedValue(
  reads: FieldRead[],
  minAgreeing: number,
  /** Field name, to log grouped near-identical reads (calibration logs). */
  logAs?: string,
  similar?: (a: string, b: string) => boolean,
): string | null {
  const groups: ReadGroup[] = [];
  for (const r of reads) {
    const key = readKey(r.value);
    const g =
      groups.find(x => x.key === key) ??
      (similar ? groups.find(x => x.reads.some(o => similar(o.value, r.value))) : undefined);
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
  if (logAs && similar && bySpelling.size > 1) {
    sidewallLog(`${logAs}: near-identical reads grouped`, {
      reads: winner.reads.map(r => r.value),
      chosen: pick.best.value,
    });
  }
  return pick.best.value;
}

// ---------------------------------------------------------------- full frame

// Used only when the text detector found no regions in a frame (or isn't in
// the build). A whole sidewall frame has lots of other text, so only strict
// patterns are accepted, and make / model are never read this way.

/** Plausible tyre size ranges (mm width, aspect %, rim inches) for full-frame reads. */
export const FULL_FRAME_SIZE_LIMITS = { width: [100, 395], aspect: [20, 95], rim: [8, 26] } as const;

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

const sizeWithinLimits = (p: { widthMm: number; aspectRatio: number; rimInches: number }) =>
  within(p.widthMm, FULL_FRAME_SIZE_LIMITS.width) &&
  within(p.aspectRatio, FULL_FRAME_SIZE_LIMITS.aspect) &&
  within(p.rimInches, FULL_FRAME_SIZE_LIMITS.rim);

/**
 * Size from a whole frame (or from crops of other text): one OCR line at a
 * time, never joined across the frame, parsed by `parseTyreSize` and within
 * `FULL_FRAME_SIZE_LIMITS`; then `recoverSize`.
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
