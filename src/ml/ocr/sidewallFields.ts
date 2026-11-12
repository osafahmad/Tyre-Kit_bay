import type { SidewallDetails } from '../../features/inspection/types';
import { KNOWN_TYRE_BRANDS } from '../../config/tyreBrands';
import { KNOWN_TYRE_MODELS } from '../../config/tyreModels';
import {
  COMPACT_SHORT_SIZE_PATTERN,
  COMPACT_SIZE_PATTERN,
  DOT_MARKER,
  parseDotAge,
  parseTyreSize,
  textAfterDotMarker,
} from './parsers';
import { sidewallLog } from './sidewallDebug';
import type { OcrLineLike } from './textCandidates';

// Turns ML Kit lines read from a whole saved sidewall frame into candidates
// for size, DOT/TIN, make and model (sidewallTextFilter.ts combines them).
// Only text that was actually read is returned. Characters are never swapped,
// completed or matched to a look-alike, except the narrow CLAUDE.md exceptions
// marked below. Model is read only as a listed family name in tyreModels.ts
// (owner decision 2026-11-11). Candidates are suggestions: the user confirms
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
 * DOT marker (`DOT_MARKER` in parsers.ts) and anything before it. Valid only when it ends in a real week/year date code (week 1–53,
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
  const text = fixDateCodeLeadingO(textAfterDotMarker(cleaned) ?? cleaned);
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

/**
 * `R15`, `R 15`, `ZR15`; `R154` (a stray digit after the rim); and, from the
 * iPhone 13 logs (owner decision 2026-11-10), a rim with the load/speed index
 * glued on (`R1585V`, `3R1525V`) or a digit glued before it. A letter directly
 * before the `R` still rules it out (`STR15` is not a rim).
 * `B` is taken as the rim marker too (owner decision 2026-11-10, iPhone 13
 * read `5B15 85VE C`), and the joined size is always written with `R`.
 */
const RIM_TOKEN = /(?:^|[^A-Z])Z?[RB]\s?(\d{2})(?:\d{2,3}(?:\/\d{2,3})?\s?[A-Z]|\d)?(?!\d)/;
/**
 * `8` read for `R` (owner decision 2026-11-10, iPhone 13: `815W5V`,
 * `815 85V`). Only rims 13–22, nothing glued before the `8` except a symbol
 * (`$815`, `#815`) or, round 11 (owner request 2026-11-11, screen-capture
 * logs: `3815`), one `3` at a token start; any other digit still rules it
 * out (`5815`). Only when a letter or a load/speed index follows directly
 * (so `815 KG` or a bare `815` is not a rim). Used only next to a width/aspect.
 */
const RIM_TOKEN_8 = /(?:^|[^A-Z0-9])3?8(1[3-9]|2[0-2])(?=[A-Z]|\s?\d{2,3}[A-Z])/;
/**
 * `l` or `I` read for the `1` of a rim (owner decision 2026-11-10, iPhone 13:
 * `Rl565V`), on uppercased text: `RL5`/`RI5` → R15. Only rims 13–19, followed
 * by a load/speed index (`65V`), a lone speed symbol (`Rl5 V`, round 8), or
 * the end of the token (`Rl5`, round 8). Never with more letters glued on.
 */
const RIM_TOKEN_L1 = /(?:^|[^A-Z])Z?R\s?[LI]([3-9])(?=\s?\d{2,3}(?:\/\d{2,3})?\s?[A-Z]|\s?[A-HJ-NP-WYZ](?![A-Z])|(?![A-Z0-9]))/;
const rimIn = (text: string): number | null => {
  const m = RIM_TOKEN.exec(text) ?? RIM_TOKEN_8.exec(text);
  if (m) return Number(m[1]);
  const l1 = RIM_TOKEN_L1.exec(text);
  return l1 ? 10 + Number(l1[1]) : null;
};

/** Aspect then a rim at the start of a line, no width (`55 R15`, `55 Rl565V`). Group: aspect; the rest goes to `rimIn`. */
const ASPECT_THEN_RIM = /^\W*([3-7][05])\s?(?=Z?[RB])/;
/** A line that is only a 3-digit width, optionally with a slash (`195`, `195/`). */
const WIDTH_ALONE = /^\W*(\d{3})\s*\/?\W*$/;
/** A line that is only a 2-digit width and a slash, with at most one letter before (`95/`, `A95/`). */
const SHORT_WIDTH_ALONE = /^\W*[A-Z]?(\d{2})\s*\/\W*$/;

/**
 * Owner decision 2026-11-10 (iPhone 13, round 7): width/aspect read without a
 * slash. Only a width 160–295 ending in 0/5 and an aspect 30–75 ending in 0/5.
 * - `COMPACT_ALONE`: a line that is only the 5 digits (`19555`).
 * - `SPACED_WIDTH_ASPECT`: a space, dot, dash or `)` instead of the slash (`195 55`).
 * - `SPACED_SHORT_WIDTH_ASPECT`: the same with only two width digits
 *   (`A95 55`), completed only by the rim-gated `SIZE_WIDTH_INFERENCE`.
 */
const COMPACT_ALONE = /^\W*(1[6-9][05]|2\d[05])([3-7][05])\W*$/;
const SPACED_WIDTH_ASPECT = /(?:^|[^0-9])(1[6-9][05]|2\d[05])\s*[\s.\-)]\s*([3-7][05])(?![0-9])/;
const SPACED_SHORT_WIDTH_ASPECT = /(?:^|[^0-9])(\d{2})\s*[\s.\-)]\s*([3-7][05])(?![0-9])/;
/**
 * Rim with no marker, only at the start of the line right after a slash-less
 * width/aspect, and only with a load/speed index glued on or after a space
 * (`1585V6:`, `15 85V`). A bare `15` or `158` is not a rim.
 */
const RIM_LOAD_UNMARKED_AT_START = /^\W*(1[3-9]|2[0-2])\s?\d{2,3}(?:\/\d{2,3})?\s?[A-HJ-NP-WYZ]/;
/**
 * Round 11 (owner request 2026-11-11): a whole line that is only an unmarked
 * rim + load/speed index (`1545V)`, `15 85V`, `1585V6:`). Stricter than
 * `RIM_LOAD_UNMARKED_AT_START`: no letter may follow the speed symbol, so
 * `1323 LBS` (week 13 of 2023, or a load in pounds) is not a rim. Used after
 * a full width/aspect on the previous line, and as a cross-frame size part.
 */
const RIM_LOAD_UNMARKED_LINE = /^\W*(1[3-9]|2[0-2])\s?\d{2,3}(?:\/\d{2,3})?\s?[A-HJ-NP-WYZ][^A-Z]*$/;

/** Width/aspect then a rim marker ending the line, digits on the next line (`195/55 R`, `225/45 ZR`). */
const WIDTH_ASPECT_MARKER_AT_END = /(?:^|[^0-9])(\d{3})\s*\/\s*(\d{2})\s?(ZR|R|B)\W*$/;
/**
 * Rim digits starting a line (`15`, `15 85V`, `1585V`, `158s`): 13–22, then
 * the end, a non-digit, a load/speed index, or one stray digit and a letter.
 * `1555` (could be a date code) doesn't count.
 */
const RIM_DIGITS_AT_START = /^\W*(1[3-9]|2[0-2])(?=$|[^0-9]|\d{2,3}[A-Z]|\d[A-Z])/;

/**
 * Owner decision 2026-11-10 (iPhone 13: `195/55 R` then `158s`): the rim
 * marker ends one line and its digits start the next. Both pieces were read,
 * so they are joined; `B` is written as `R`, `ZR` is kept.
 */
function joinMarkerWithRimDigits(ordered: string[]): string | null {
  for (let i = 0; i + 1 < ordered.length; i++) {
    const head = WIDTH_ASPECT_MARKER_AT_END.exec(ordered[i]);
    if (!head) continue;
    const rim = RIM_DIGITS_AT_START.exec(ordered[i + 1]);
    if (!rim) continue;
    const p = parseTyreSize(`${head[1]}/${head[2]} ${head[3] === 'ZR' ? 'ZR' : 'R'}${rim[1]}`);
    if (p && sizeWithinLimits(p)) {
      sidewallLog('size recovered: rim marker at line end joined with rim digits on the next line', {
        lines: [ordered[i], ordered[i + 1]],
        size: p.value,
      });
      return p.value;
    }
  }
  return null;
}

/**
 * Owner decision 2026-11-10 (iPhone 13: `55 R15`): an aspect+rim line joined
 * with a width read on its own on the previous or next line. A 3-digit width
 * is joined as read; a 2-digit width (`95/`) only through the rim-gated
 * `SIZE_WIDTH_INFERENCE`. A width is never added when none was read.
 */
function joinAspectRimWithWidth(ordered: string[]): string | null {
  for (let i = 0; i < ordered.length; i++) {
    const a = ASPECT_THEN_RIM.exec(ordered[i]);
    if (!a) continue;
    const rim = rimIn(ordered[i].slice(a[0].length));
    if (rim === null) continue;
    for (const j of [i - 1, i + 1]) {
      const text = ordered[j];
      if (text === undefined) continue;
      const full = WIDTH_ALONE.exec(text);
      let width: number | undefined = full ? Number(full[1]) : undefined;
      if (width === undefined) {
        const short = SHORT_WIDTH_ALONE.exec(text);
        const [minRim, maxRim] = SIZE_WIDTH_INFERENCE.rims;
        if (!short || rim < minRim || rim > maxRim) continue;
        width = (SIZE_WIDTH_INFERENCE.widths as readonly number[]).find(w => w % 100 === Number(short[1]));
      }
      if (width === undefined) continue;
      const p = parseTyreSize(`${width}/${a[1]} R${rim}`);
      if (p && sizeWithinLimits(p)) {
        sidewallLog('size recovered: aspect+rim joined with a width read on its own line', {
          lines: [ordered[i], text],
          size: p.value,
        });
        return p.value;
      }
    }
  }
  return null;
}
/** Lines searched for a rim, nearest first: same, next, previous, then two away (owner decision 2026-11-10). */
const RIM_SEARCH_JOIN = [0, 1, -1, 2, -2] as const;
/** The width inference exception only looks at the same or adjacent line (CLAUDE.md). */
const RIM_SEARCH_INFER = [0, 1, -1] as const;
/** Full width/aspect read: `195/55`, `195 / 55`. */
const FULL_WIDTH_ASPECT = /(?:^|[^0-9])(\d{3})\s*\/\s*(\d{2})(?!\d)/;
/** Two-digit width read, optionally after one non-digit misread (`A95/55`, `95/55`). */
const SHORT_WIDTH_ASPECT = /(?:^|[^0-9])(\d{2})\s*\/\s*(\d{2})(?!\d)/;

/**
 * Size from separate pieces, all read by OCR:
 * 1. a full width/aspect (`195/55`) plus a rim token (`R15`, `R1585V`) on the
 *    same line or up to two lines before/after it, nearest first, joined;
 * 2. else, a slash-less size with its rim on the same line (`19555 R15`,
 *    `COMPACT_SIZE_PATTERN`);
 * 3. else, `SIZE_WIDTH_INFERENCE` on a slash-less short read (`9555 R15`), then
 *    on a two-digit width (`95/55`) with a rim in 13–17 on the same or adjacent
 *    line, completed only to a width in 175–225.
 * Also a slash-less width/aspect (`19555` alone, `195 55`) joined with a
 * marked rim within two lines or a rim+load (`1585V`) starting the next line;
 * `195/55 R` joined with rim digits starting the next line
 * (`joinMarkerWithRimDigits`), and `55 R15` joined with a width read alone on the next/previous line
 * (`joinAspectRimWithWidth`).
 * Rim markers: `R`, `B`, or `8` (`RIM_TOKEN_8`), and `RL5`/`RI5` for R15
 * (`RIM_TOKEN_L1`); the result is written with `R`.
 * Every result must parse and be within `FULL_FRAME_SIZE_LIMITS`.
 */
export function recoverSize(lines: OcrLineLike[]): string | null {
  const ordered = readingOrder(lines).map(l => l.text.toUpperCase());
  const rimNear = (i: number, offsets: readonly number[]): number | null => {
    for (const j of offsets.map(d => i + d)) {
      const text = ordered[j];
      if (text === undefined) continue;
      // On the width's own line, look only after the aspect ratio.
      const rim = rimIn(j === i ? text.replace(/^.*?\/\s*\d{2}/, ' ') : text);
      if (rim !== null) return rim;
    }
    return null;
  };
  const split = joinMarkerWithRimDigits(ordered);
  if (split) return split;
  for (let i = 0; i < ordered.length; i++) {
    const full = FULL_WIDTH_ASPECT.exec(ordered[i]);
    if (!full) continue;
    // Round 11: like the slash-less path below, an unmarked rim + load/speed
    // line (`1545V)`) directly after the width/aspect counts as its rim.
    const next = ordered[i + 1];
    const unmarked = next === undefined ? null : RIM_LOAD_UNMARKED_LINE.exec(next);
    const rim = rimNear(i, RIM_SEARCH_JOIN) ?? (unmarked ? Number(unmarked[1]) : null);
    if (rim === null) continue;
    const p = parseTyreSize(`${full[1]}/${full[2]} R${rim}`);
    if (p && sizeWithinLimits(p)) {
      sidewallLog('size recovered: width/aspect joined with a nearby rim', { lines: ordered, size: p.value });
      return p.value;
    }
  }
  for (const text of ordered) {
    const compact = COMPACT_SIZE_PATTERN.exec(text);
    if (!compact) continue;
    const p = parseTyreSize(`${compact[1]}/${compact[2]} R${compact[3]}`);
    if (p && sizeWithinLimits(p)) {
      sidewallLog('size recovered: slash-less width/aspect read before a rim', { read: text, size: p.value });
      return p.value;
    }
  }
  for (let i = 0; i < ordered.length; i++) {
    if (FULL_WIDTH_ASPECT.test(ordered[i])) continue;
    const loose = COMPACT_ALONE.exec(ordered[i]) ?? SPACED_WIDTH_ASPECT.exec(ordered[i]);
    if (!loose) continue;
    const next = ordered[i + 1];
    const unmarked = next === undefined ? null : RIM_LOAD_UNMARKED_AT_START.exec(next);
    const rim = rimNear(i, RIM_SEARCH_JOIN) ?? (unmarked ? Number(unmarked[1]) : null);
    if (rim === null) continue;
    const p = parseTyreSize(`${loose[1]}/${loose[2]} R${rim}`);
    if (p && sizeWithinLimits(p)) {
      sidewallLog('size recovered: slash-less width/aspect joined with a nearby rim', {
        lines: [ordered[i], ...(next === undefined ? [] : [next])],
        size: p.value,
      });
      return p.value;
    }
  }
  const joined = joinAspectRimWithWidth(ordered);
  if (joined) return joined;
  for (const text of ordered) {
    if (COMPACT_SIZE_PATTERN.test(text)) continue;
    const short = COMPACT_SHORT_SIZE_PATTERN.exec(text);
    if (!short) continue;
    const rim = Number(short[3]);
    const [minRim, maxRim] = SIZE_WIDTH_INFERENCE.rims;
    const width = (SIZE_WIDTH_INFERENCE.widths as readonly number[]).find(w => w % 100 === Number(short[1]));
    if (rim < minRim || rim > maxRim || width === undefined) continue;
    const p = parseTyreSize(`${width}/${short[2]} R${rim}`);
    if (p && sizeWithinLimits(p)) {
      sidewallLog('size recovered: slash-less, width hundreds digit inferred (rim-gated, CLAUDE.md exception)', {
        read: text,
        size: p.value,
      });
      return p.value;
    }
  }
  for (let i = 0; i < ordered.length; i++) {
    if (FULL_WIDTH_ASPECT.test(ordered[i]) || SPACED_WIDTH_ASPECT.test(ordered[i])) continue;
    const short = SHORT_WIDTH_ASPECT.exec(ordered[i]) ?? SPACED_SHORT_WIDTH_ASPECT.exec(ordered[i]);
    if (!short) continue;
    const rim = rimNear(i, RIM_SEARCH_INFER);
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

/**
 * A rim marker, rim 13–22, then a load/speed index (`R15 85Vt`, `B1585V`,
 * `Rl565V`). The shape of the size's own rim, not a stray `R15`.
 */
const RIM_WITH_LOAD = /(?:^|[^A-Z])Z?(?:[RB]\s?(1[3-9]|2[0-2])|R\s?[LI]([3-9]))\s?\d{2,3}(?:\/\d{2,3})?\s?[A-HJ-NP-WYZ]/;
/** Round 11: the same with `8` read for `R` (`$815 85V`, `3815 85V`, `$81525NE`), under the `RIM_TOKEN_8` rules. */
const RIM_8_WITH_LOAD = /(?:^|[^A-Z0-9])3?8(1[3-9]|2[0-2])\s?\d{2,3}(?:\/\d{2,3})?\s?[A-HJ-NP-WYZ]/;

export type SizeParts = {
  widthAspect: string | null;
  /** Two-digit width read with its aspect (`A95/55` → `95/55`): only completed through the rim-gated `SIZE_WIDTH_INFERENCE`. */
  shortWidthAspect: string | null;
  rim: number | null;
};

/**
 * Size pieces from one frame that gave no whole size, for joining across the
 * frames of one scan (owner decision 2026-11-10, round 8; see
 * `sidewallReader.ts`). Width/aspect: a full 3-digit width, read with a slash
 * (`195/55`), a separator (`195 55`) or as 5 digits alone on a line (`19555`).
 * Rim: `RIM_WITH_LOAD`, or round 11 (owner request 2026-11-11) `8` read for
 * `R` (`RIM_8_WITH_LOAD`) or a whole line that is an unmarked rim + load/speed
 * (`RIM_LOAD_UNMARKED_LINE`, `1545V)`).
 * Round 11 also returns a two-digit width/aspect (`A95/55`, `I95/55`,
 * `95/55`) separately, when no full one was read; `sidewallReader.ts`
 * completes it only with the rim-gated `SIZE_WIDTH_INFERENCE`.
 */
export function sizeParts(lines: OcrLineLike[]): SizeParts {
  let widthAspect: string | null = null;
  let shortWidthAspect: string | null = null;
  let rim: number | null = null;
  for (const text of readingOrder(lines).map(l => l.text.toUpperCase())) {
    if (widthAspect === null) {
      const m = FULL_WIDTH_ASPECT.exec(text) ?? COMPACT_ALONE.exec(text) ?? SPACED_WIDTH_ASPECT.exec(text);
      if (m && within(Number(m[1]), FULL_FRAME_SIZE_LIMITS.width) && within(Number(m[2]), FULL_FRAME_SIZE_LIMITS.aspect)) {
        widthAspect = `${m[1]}/${m[2]}`;
      } else if (shortWidthAspect === null && !SPACED_WIDTH_ASPECT.test(text)) {
        const s = SHORT_WIDTH_ASPECT.exec(text) ?? SPACED_SHORT_WIDTH_ASPECT.exec(text);
        if (s && within(Number(s[2]), FULL_FRAME_SIZE_LIMITS.aspect)) shortWidthAspect = `${s[1]}/${s[2]}`;
      }
    }
    if (rim === null) {
      const r = RIM_WITH_LOAD.exec(text);
      if (r) rim = r[1] ? Number(r[1]) : 10 + Number(r[2]);
      else {
        const u = RIM_8_WITH_LOAD.exec(text) ?? RIM_LOAD_UNMARKED_LINE.exec(text);
        if (u) rim = Number(u[1]);
      }
    }
  }
  return { widthAspect, shortWidthAspect: widthAspect === null ? shortWidthAspect : null, rim };
}

/**
 * Round 11 (owner request 2026-11-11): `SIZE_WIDTH_INFERENCE` applied to a
 * two-digit width/aspect (`95/55`) and a rim read in different frames of one
 * scan. The same gate as within a frame: rim 13–17, width completed only to
 * 175–225. Null otherwise.
 */
export function completeShortWidthAspect(shortWidthAspect: string, rim: number): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(shortWidthAspect);
  if (!m) return null;
  const [minRim, maxRim] = SIZE_WIDTH_INFERENCE.rims;
  if (rim < minRim || rim > maxRim) return null;
  const width = (SIZE_WIDTH_INFERENCE.widths as readonly number[]).find(w => w % 100 === Number(m[1]));
  if (width === undefined) return null;
  const p = parseTyreSize(`${width}/${m[2]} R${rim}`);
  return p && sizeWithinLimits(p) ? p.value : null;
}

/** Fewest letters and digits after `DOT` in a full-frame read: a whole TIN, not a lone number. */
export const FULL_FRAME_DOT_MIN_CHARS = 8;

/**
 * DOT/TIN from a whole frame: a line must contain a DOT marker (`DOT_MARKER`:
 * the word `DOT`, or its listed misreads; anything before it is dropped). That line
 * alone, or joined with the next line in reading order (TINs often wrap), must
 * give 8–13 letters and digits after `DOT`, ending in a valid date code.
 */
export function fullFrameDotCandidate(lines: OcrLineLike[], now: Date = new Date()): string | null {
  const ordered = readingOrder(lines);
  for (let i = 0; i < ordered.length; i++) {
    if (!DOT_MARKER.test(ordered[i].text.toUpperCase())) continue;
    const tries = [[ordered[i]], ...(ordered[i + 1] ? [[ordered[i], ordered[i + 1]]] : [])];
    for (const group of tries) {
      const value = dotCandidate(group, now);
      if (value && value.replace(/ /g, '').length >= FULL_FRAME_DOT_MIN_CHARS) return value;
    }
  }
  return null;
}

/** Words that mark load / pressure / approval text, never a TIN. */
const NOT_TIN_WORDS = new Set(['MAX', 'LOAD', 'PRESS', 'PRESSURE', 'KG', 'LBS', 'LB', 'PSI', 'KPA', 'TREADWEAR', 'TRACTION', 'TEMPERATURE']);

/** Width/aspect-shaped text (`195/55`, `95/55`): a size line, never a TIN. */
const WIDTH_ASPECT_SHAPED = /\d{2,3}\s*\/\s*\d{2}/;

/** Letters, digits and single spaces, uppercase; everything else becomes a space. */
const tinText = (line: OcrLineLike) =>
  line.text.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The round-9 marker-less TIN shape on already-cleaned tokens: 2+ tokens, the
 * last a valid 4-digit week/year date code; 8–13 letters and digits; at least
 * one letter before the date code; no load / pressure / grading word.
 */
function markerlessTinFromTokens(tokens: string[], now: Date): string | null {
  if (tokens.length < 2 || tokens.some(t => NOT_TIN_WORDS.has(t))) return null;
  const date = tokens[tokens.length - 1];
  if (!/^\d{4}$/.test(date) || !parseDotAge(date, now)) return null;
  const chars = tokens.join('');
  if (chars.length < FULL_FRAME_DOT_MIN_CHARS || chars.length > DOT_MAX_CHARS) return null;
  if (!/[A-Z]/.test(tokens.slice(0, -1).join(''))) return null;
  return tokens.join(' ');
}

/**
 * Owner decision 2026-11-10 (round 9): a TIN whose DOT marker wasn't read.
 * Strict shape, because sidewalls carry other 4-digit numbers that pass as a
 * date (`1323 LBS`): see `markerlessTinFromTokens`. Lines with a DOT marker go
 * through `fullFrameDotCandidate`; lines with a width/aspect or a rim+load
 * (`195/55 R15 1323`) are size text, never a TIN. sidewallReader.ts suggests
 * one only when 2 frames agree, never from a single frame.
 *
 * Round 10 (owner request 2026-11-11): the date code may have wrapped to the
 * next line (`EX2H 4KR` then `3721`), as marked TINs already may in
 * `fullFrameDotCandidate`. The next line must be exactly one 4-digit token,
 * and the body line must then have a digit as well as a letter (a plant /
 * size code, not a word such as `OUTSIDE` above a load number). A bare
 * 4-digit number with no TIN body is never a DOT/TIN read (CLAUDE.md).
 */
export function markerlessTinCandidate(lines: OcrLineLike[], now: Date = new Date()): string | null {
  const ordered = readingOrder(lines);
  for (let i = 0; i < ordered.length; i++) {
    const upper = ordered[i].text.toUpperCase();
    if (WIDTH_ASPECT_SHAPED.test(upper) || RIM_WITH_LOAD.test(upper)) continue;
    const text = tinText(ordered[i]);
    if (DOT_MARKER.test(text)) continue;
    const tokens = text.split(' ').filter(Boolean);
    const own = markerlessTinFromTokens(tokens, now);
    if (own) return own;
    const next = ordered[i + 1];
    if (!next) continue;
    const wrapped = tinText(next);
    if (!/^\d{4}$/.test(wrapped) || tokens.length === 0) continue;
    const body = tokens.join('');
    if (!/[A-Z]/.test(body) || !/\d/.test(body)) continue;
    const joined = markerlessTinFromTokens([...tokens, wrapped], now);
    if (joined) {
      sidewallLog('dot: TIN-shaped line without a marker joined with a date code on the next line', {
        lines: [ordered[i].text, next.text],
        tin: joined,
      });
      return joined;
    }
  }
  return null;
}

/** A listed name as a whole word, any case, any spacing between its words (`GENERAL  TIRE`, `Comfort Contact`). */
const wholeNamePattern = (name: string) =>
  new RegExp(`(?:^|[^A-Z0-9])(${name.toUpperCase().split(/\s+/).join('\\s*')})(?![A-Z0-9])`);

/**
 * A listed variant code as a whole token (`CC7`, `T005`), or glued to the end
 * of a letters-only fragment of the family name (`OntactCC7`, Redmi 13 frame 6,
 * owner decision 2026-11-11). Nothing may follow it, and no digit may precede
 * it (`1CC7`, `CC70` and `CC7X` are not the code).
 */
const wholeTokenPattern = (code: string) => new RegExp(`(?:^|[^0-9])${code.toUpperCase()}(?![A-Z0-9])`);

/**
 * A family name may be read with spaces at its camel-case joins
 * (`Comfort Contact` for `ComfortContact`, `Efficient Grip`), so those joins
 * are split into words before `wholeNamePattern` makes the spacing optional.
 */
const familyWords = (family: string) => family.replace(/([a-z])([A-Z])/g, '$1 $2');

const MODEL_PATTERNS = KNOWN_TYRE_MODELS.map(m => ({
  model: m,
  re: wholeNamePattern(familyWords(m.family)),
  codes: m.codes.map(code => ({ code, re: wholeTokenPattern(code) })),
}));

export type ModelRead = {
  brand: string;
  /** Listed spelling of the family (`ComfortContact`), whatever the spacing or case read. */
  family: string;
  /** A listed code of that family read as a whole token in the same frame (`CC7`), or null. */
  code: string | null;
};

/** `family` or `family code`: the model text suggested for a read. */
export const modelText = (read: Pick<ModelRead, 'family' | 'code'>) =>
  read.code ? `${read.family} ${read.code}` : read.family;

/**
 * Model from a whole frame (owner decision 2026-11-11): a line containing a
 * family name from `tyreModels.ts` exactly, as a whole word, any case and
 * spacing; the most prominent (tallest) line first. The value is the listed
 * spelling, so `Comfort Contact` and `COMFORTCONTACT` both give
 * `ComfortContact`. A listed code of that family read as a whole token
 * anywhere in the frame is attached (`CC7`). Fragments (`orContact`),
 * unlisted models and bare numbers (`Primacy 4` → `Primacy`) never add text.
 * With no exact match, a read within `MODEL_FAMILY_FUZZY` edits of one listed
 * family (`Comfortontact`, `Comforto Contact`) gives that family
 * (`nearestModelFamily`, owner decision 2026-11-11).
 */
export function fullFrameModelCandidate(
  lines: OcrLineLike[],
  nearbyCodes: readonly { family: string; code: string }[] = [],
): ModelRead | null {
  const uppers = lines.map(l => l.text.toUpperCase());
  const frameCodes = MODEL_PATTERNS.flatMap(({ model, codes }) =>
    codes.filter(c => uppers.some(u => c.re.test(u))).map(c => ({ family: model.family, code: c.code })),
  );
  const codesRead = [...frameCodes, ...nearbyCodes];
  const codeOf = (family: string, codes: readonly { family: string; code: string }[]) =>
    codes.find(c => c.family === family)?.code ?? null;
  const byHeight = [...lines].sort((a, b) => b.frame.height - a.frame.height);
  for (const line of byHeight) {
    const upper = line.text.toUpperCase();
    for (const { model, re } of MODEL_PATTERNS) {
      if (!re.test(upper)) continue;
      return { brand: model.brand, family: model.family, code: codeOf(model.family, frameCodes) };
    }
  }
  // No family read exactly: the noise-tolerant match (owner decisions 2026-11-11 and 2026-11-12).
  for (const line of byHeight) {
    const hit = nearestModelFamily(line.text, codesRead);
    if (hit) {
      sidewallLog('model: family matched with OCR noise (owner decision 2026-11-11)', {
        read: line.text,
        family: hit.model.family,
        distance: hit.distance,
        ...(hit.lockedFrom ? { lockedFrom: hit.lockedFrom } : {}),
      });
      return { brand: hit.model.brand, family: hit.model.family, code: codeOf(hit.model.family, codesRead) };
    }
  }
  // Still nothing: the name split over two adjacent lines (owner request 2026-11-12, round 2).
  const split = splitLineModelFamily(lines);
  if (split) {
    sidewallLog('model: family read split over two adjacent lines (owner request 2026-11-12)', split.log);
    return { brand: split.model.brand, family: split.model.family, code: codeOf(split.model.family, codesRead) };
  }
  return null;
}

/** Levenshtein edit distance (insert, delete, substitute), capped: returns `max + 1` once the distance exceeds `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Owner decision 2026-11-11 (Redmi 13 logs: `Comfortontact`, `ComiortContae`,
 * `Comforto Contact`, `ComioriContac` with `CC7` read in the same frames): how
 * far a read may be from a listed family's letters and still count.
 * - Families of 10+ letters: 2 edits; 6–9 letters: 1 edit; shorter: exact only.
 * - 3 edits for a family of 12+ letters when one of that family's listed codes
 *   was read as a whole token in the same frame (the code confirms the family).
 * - The read must be the unique closest family: any other family at the same
 *   or a smaller distance means no match.
 * The read is a run of 1–3 consecutive letter tokens on one line with the
 * spaces removed, so `Comforto Contact` compares as `COMFORTOCONTACT`.
 * Digits and punctuation split tokens. The result is always the listed
 * spelling; the read text is never shown.
 */
export const MODEL_FAMILY_FUZZY = { twoEditsFrom: 10, oneEditFrom: 6, threeEditsWithCodeFrom: 12 } as const;

type ModelPattern = (typeof MODEL_PATTERNS)[number];

/**
 * The last word of a family when at least two listed families share it
 * (`CONTACT` for `ComfortContact` and `SportContact`), else ''. The letters
 * before it are the family's distinct prefix (`COMFORT`, `SPORT`).
 */
const lastWord = (family: string) => {
  const words = familyWords(family).toUpperCase().split(/\s+/);
  return words.length >= 2 ? words[words.length - 1].replace(/[^A-Z]/g, '') : '';
};
const SHARED_LAST_WORDS = new Set(
  KNOWN_TYRE_MODELS.map(m => lastWord(m.family)).filter((w, i, all) => w && all.indexOf(w) !== i),
);
const FAMILY_LETTERS = MODEL_PATTERNS.map(p => {
  const letters = p.model.family.toUpperCase().replace(/[^A-Z]/g, '');
  const word = lastWord(p.model.family);
  const suffix = SHARED_LAST_WORDS.has(word) && letters.endsWith(word) ? word : '';
  return { pattern: p, letters, suffix, prefix: letters.slice(0, letters.length - suffix.length) };
});
type FamilyLetters = (typeof FAMILY_LETTERS)[number];

/** Same brand and same shared last word: families OCR noise can confuse (`ComfortContact` / `SportContact`). */
const isSibling = (a: FamilyLetters, b: FamilyLetters) =>
  a !== b && a.suffix !== '' && a.suffix === b.suffix && a.pattern.model.brand === b.pattern.model.brand;

/**
 * Owner decision 2026-11-12 (iPhone 13: a ComfortContact CC7 read as
 * `SportContact`, from curved fragments such as `ortContact`): when a family
 * shares its last word with other listed families, the read's prefix (split
 * where prefix + last-word edits are fewest) must be within a third of the
 * distinct prefix's length (`SPORT` 1 edit, `COMFORT` 2) and strictly closer
 * to it than to every sibling's prefix. `ortContact` (`ORT` is 2 from `SPORT`)
 * no longer gives SportContact.
 */
export const MODEL_PREFIX_FUZZY = { prefixEditsPerLetter: 1 / 3 } as const;

function prefixMatches(read: string, fam: FamilyLetters): boolean {
  if (!fam.suffix) return true;
  let best: { total: number; prefixEdits: number; readPrefix: string } | null = null;
  for (let k = 0; k <= read.length; k++) {
    const readPrefix = read.slice(0, k);
    const prefixEdits = editDistance(readPrefix, fam.prefix);
    const total = prefixEdits + editDistance(read.slice(k), fam.suffix);
    if (!best || total < best.total || (total === best.total && prefixEdits < best.prefixEdits)) {
      best = { total, prefixEdits, readPrefix };
    }
  }
  if (!best) return false;
  if (best.prefixEdits > Math.floor(fam.prefix.length * MODEL_PREFIX_FUZZY.prefixEditsPerLetter)) return false;
  const readPrefix = best.readPrefix;
  return FAMILY_LETTERS.every(other => !isSibling(fam, other) || editDistance(readPrefix, other.prefix) > best!.prefixEdits);
}

function nearestModelFamily(
  text: string,
  codesRead: readonly { family: string; code: string }[],
): { model: ModelPattern['model']; distance: number; lockedFrom?: string } | null {
  const tokens = text.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  const reads: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let n = 1; n <= 3 && i + n <= tokens.length; n++) reads.push(tokens.slice(i, i + n).join(''));
  }
  const codeFamilies = new Set(codesRead.map(c => c.family));
  const candidates: { fam: FamilyLetters; read: string; distance: number }[] = [];
  for (const read of reads) {
    for (const fam of FAMILY_LETTERS) {
      const { letters } = fam;
      const codeRead = codeFamilies.has(fam.pattern.model.family);
      const allowed =
        codeRead && letters.length >= MODEL_FAMILY_FUZZY.threeEditsWithCodeFrom
          ? 3
          : letters.length >= MODEL_FAMILY_FUZZY.twoEditsFrom
            ? 2
            : letters.length >= MODEL_FAMILY_FUZZY.oneEditFrom
              ? 1
              : 0;
      if (allowed === 0 || read === letters) continue;
      const d = editDistance(read, letters, allowed);
      if (d <= allowed) candidates.push({ fam, read, distance: d });
    }
  }
  if (candidates.length === 0) return null;

  // Owner decision 2026-11-12: a listed code read in this or an adjacent frame
  // (`CC7`) locks the family. A noisy read matching that family or one of its
  // siblings (`SportContact`) gives the code's family (`ComfortContact`).
  const locks = FAMILY_LETTERS.filter(
    fam => codeFamilies.has(fam.pattern.model.family) && candidates.some(c => c.fam === fam || isSibling(c.fam, fam)),
  );
  if (locks.length === 1) {
    const lock = locks[0];
    const matched = candidates.filter(c => c.fam === lock || isSibling(c.fam, lock));
    const distance = Math.min(...matched.map(c => c.distance));
    const sibling = matched.find(c => c.fam !== lock && c.distance === distance) ?? matched.find(c => c.fam !== lock);
    const own = matched.some(c => c.fam === lock);
    return { model: lock.pattern.model, distance, ...(!own && sibling ? { lockedFrom: sibling.fam.pattern.model.family } : {}) };
  }

  let best: { fam: FamilyLetters; distance: number } | null = null;
  let tie = false;
  for (const c of candidates) {
    if (!prefixMatches(c.read, c.fam)) continue;
    if (!best || c.distance < best.distance) {
      best = { fam: c.fam, distance: c.distance };
      tie = false;
    } else if (c.distance === best.distance && best.fam !== c.fam) {
      tie = true;
    }
  }
  if (!best || tie) return null;
  return { model: best.fam.pattern.model, distance: best.distance };
}

/**
 * Owner request 2026-11-12, round 2 (iPhone 13: iOS Vision splits a curved
 * `ComfortContact` over two lines, `Comfori` / `Comfo` / `Comtortco` then
 * `Contact` / `ioricontac`). For a family whose last word is shared
 * (`…Contact`), two lines next to each other in reading order (either order)
 * give the family when:
 * - one line has a letter token starting with the distinct prefix, within
 *   `MODEL_SPLIT_FUZZY.maxEdits` and within the prefix rule's own allowance
 *   (`COMFORT` 2, `SPORT` 1), strictly closer than any sibling's prefix;
 * - the other has a letter token ending with the shared word within
 *   `maxEdits` (`CONTACT`);
 * - letters left over at the join (OCR reading the join twice: `co` after
 *   `Comtort`, `iori` before `contac`) are at most `maxJoinLetters` and look
 *   like the other part's start or end (at most half of them wrong).
 * Families with a distinct prefix under `minPrefixLetters` (`Max`, `Eco`,
 * `Van`: everyday sidewall words) are never split-matched, and each piece
 * needs `minPieceLetters`. The family must be the unique best. A `Contact` line with no matching
 * prefix line never gives a family, so a bare `Contact` is never SportContact.
 */
export const MODEL_SPLIT_FUZZY = { maxEdits: 2, maxJoinLetters: 4, minPrefixLetters: 5, minPieceLetters: 4 } as const;

const letterTokens = (text: string) => text.toUpperCase().split(/[^A-Z]+/).filter(Boolean);

/** Edits for `token` = `prefix` + join letters that look like the start of `suffix`; null when it doesn't fit. */
function prefixPieceEdits(token: string, fam: FamilyLetters): number | null {
  let best: number | null = null;
  for (let tail = 0; tail <= Math.min(MODEL_SPLIT_FUZZY.maxJoinLetters, token.length - MODEL_SPLIT_FUZZY.minPieceLetters); tail++) {
    const head = token.slice(0, token.length - tail);
    const join = token.slice(token.length - tail);
    if (editDistance(join, fam.suffix.slice(0, tail)) > Math.floor(tail / 2)) continue;
    const d = editDistance(head, fam.prefix, MODEL_SPLIT_FUZZY.maxEdits);
    if (d <= MODEL_SPLIT_FUZZY.maxEdits && (best === null || d < best)) best = d;
  }
  return best;
}

/** Edits for `token` = join letters that look like the end of `prefix` + `suffix`; null when it doesn't fit. */
function suffixPieceEdits(token: string, fam: FamilyLetters): number | null {
  let best: number | null = null;
  for (let lead = 0; lead <= Math.min(MODEL_SPLIT_FUZZY.maxJoinLetters, token.length - MODEL_SPLIT_FUZZY.minPieceLetters); lead++) {
    const join = token.slice(0, lead);
    const tail = token.slice(lead);
    if (lead > 0 && editDistance(join, fam.prefix.slice(-lead)) > Math.floor(lead / 2)) continue;
    const d = editDistance(tail, fam.suffix, MODEL_SPLIT_FUZZY.maxEdits);
    if (d <= MODEL_SPLIT_FUZZY.maxEdits && (best === null || d < best)) best = d;
  }
  return best;
}

function splitLineModelFamily(
  lines: OcrLineLike[],
): { model: ModelPattern['model']; log: Record<string, unknown> } | null {
  const ordered = readingOrder(lines);
  let best: { fam: FamilyLetters; edits: number; log: Record<string, unknown> } | null = null;
  let tie = false;
  for (let i = 0; i + 1 < ordered.length; i++) {
    for (const [first, second] of [
      [ordered[i], ordered[i + 1]],
      [ordered[i + 1], ordered[i]],
    ]) {
      for (const fam of FAMILY_LETTERS) {
        if (!fam.suffix) continue;
        const allowed = Math.min(
          MODEL_SPLIT_FUZZY.maxEdits,
          Math.floor(fam.prefix.length * MODEL_PREFIX_FUZZY.prefixEditsPerLetter),
        );
        // Short prefixes are everyday sidewall words (`MAX LOAD`, `ECO`): never split-matched.
        if (fam.prefix.length < MODEL_SPLIT_FUZZY.minPrefixLetters) continue;
        for (const a of letterTokens(first.text)) {
          if (a.length < MODEL_SPLIT_FUZZY.minPieceLetters) continue;
          const pe = prefixPieceEdits(a, fam);
          if (pe === null || pe > allowed) continue;
          // The prefix piece must be strictly closer to this family than to any sibling.
          const rivalled = FAMILY_LETTERS.some(
            other =>
              isSibling(fam, other) &&
              other.prefix.length >= MODEL_SPLIT_FUZZY.minPrefixLetters &&
              (prefixPieceEdits(a, other) ?? Infinity) <= pe,
          );
          if (rivalled) continue;
          for (const b of letterTokens(second.text)) {
            if (b.length < MODEL_SPLIT_FUZZY.minPieceLetters) continue;
            const se = suffixPieceEdits(b, fam);
            if (se === null) continue;
            const edits = pe + se;
            const log = { lines: [first.text, second.text], family: fam.pattern.model.family, prefixEdits: pe, suffixEdits: se };
            if (!best || edits < best.edits) {
              best = { fam, edits, log };
              tie = false;
            } else if (edits === best.edits && best.fam !== fam) {
              tie = true;
            }
          }
        }
      }
    }
  }
  if (!best || tie) return null;
  return { model: best.fam.pattern.model, log: best.log };
}

/**
 * A listed variant code read as a whole token in this frame (or glued to the
 * end of a family fragment, `OntactCC7`), with its family, even when the
 * family name itself wasn't read here (`CC7` alone). Used by
 * `sidewallReader.ts` to combine `ComfortContact` from one frame with `CC7`
 * from another; never suggested on its own.
 */
export function fullFrameModelCode(lines: OcrLineLike[]): { family: string; code: string } | null {
  for (const upper of lines.map(l => l.text.toUpperCase())) {
    for (const { model, codes } of MODEL_PATTERNS) {
      const hit = codes.find(c => c.re.test(upper));
      if (hit) return { family: model.family, code: hit.code };
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
