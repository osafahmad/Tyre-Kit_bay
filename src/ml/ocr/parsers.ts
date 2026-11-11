// Parser reference from spec §5. OCR clean-up stays separate so the user can
// correct messy text before it's parsed.

export type ParsedTyreSize = {
  value: string;
  widthMm: number;
  aspectRatio: number;
  construction: string;
  rimInches: number;
};

/** Spec §5 tyre size, on uppercased text: `205/55R16`, `195/65 R15`, `225/45ZR17`, `LT265/70 R17`. */
export const TYRE_SIZE_PATTERN = /\b(P|LT|ST|T)?\s*(\d{3})\s*\/\s*(\d{2})\s*(ZR|R|D|B)?\s*(\d{2}(?:\.\d)?)\b/;

export function parseTyreSize(text: string): ParsedTyreSize | null {
  const match = text.toUpperCase().match(TYRE_SIZE_PATTERN);
  if (!match) return null;
  const [, prefix = '', width, aspectRatio, construction = 'R', rim] = match;
  return {
    value: `${prefix}${width}/${aspectRatio} ${construction}${rim}`,
    widthMm: Number(width),
    aspectRatio: Number(aspectRatio),
    construction,
    rimInches: Number(rim),
  };
}

/**
 * Slash-less sizes (owner decision 2026-11-10, iPhone 13: `19555 R15`), on
 * uppercased text. A 5-digit width+aspect then a rim marker and rim 13–22:
 * width 160–295 ending in 0 or 5, aspect 30–75 ending in 0 or 5. The rim
 * marker may be `R`, `B`, or `8` after a space (`19555 815`): a bare `8` glued
 * to the digits (`19555815`) is not split. Groups: width, aspect, rim.
 */
export const COMPACT_SIZE_PATTERN =
  /(?:^|[^0-9A-Z])(1[6-9][05]|2\d[05])([3-7][05])(?:\s?[RB]|\s8)\s?(1[3-9]|2[0-2])(?![0-9])/;

/**
 * The same with only the last two width digits (`9555 R15`). Groups: the two
 * width digits, aspect, rim. Only completed through `SIZE_WIDTH_INFERENCE`.
 */
export const COMPACT_SHORT_SIZE_PATTERN =
  /(?:^|[^0-9])(\d{2})([3-7][05])(?:\s?[RB]|\s8)\s?(1[3-9]|2[0-2])(?![0-9])/;

/**
 * DOT marker as ML Kit reads it on worn / glary sidewalls (owner decision
 * 2026-11-10, iPhone 13 logs: `oottDE`, `ootDTO`, `ODTSID`, `DTS1D`).
 * - `DOT` as a word: no letter directly before or after it.
 * - Misread markers `D0T`, `OOT`, `DTS` (also inside `0DTS` / `ODTS`):
 *   anywhere, glued to other text.
 * - Round 9 (owner decision 2026-11-10, iPhone 13: `oTELDT`, `OT1DT`):
 *   `TELDT` and `T1DT` anywhere, glued; and as whole tokens only, `D` + `0/O/Q`
 *   + `T/I/L` (`DQT`, `DOI`) or one or two `0/O/Q` + `T/I/L` (`OT`, `0T`, `OOI`).
 * - Round 10 (owner request 2026-11-11, iPhone 13 + Redmi 13 logs): `00T`
 *   glued to other text, as long as no digit is directly before it (`1000T`
 *   is a number); and `POT` / `P0T` as whole tokens only (`P` read for `D`).
 * Only locates where the TIN starts. The TIN after it is kept as read, and is
 * accepted only if it has 8–13 letters/digits ending in a valid week/year
 * (`fullFrameDotCandidate`).
 */
export const DOT_MARKER =
  /(?:^|[^A-Z])DOT(?![A-Z])|D0T|OOT|(?:^|[^0-9])00T|DTS|TELDT|T1DT|(?:^|[^A-Z0-9])(?:D[0OQ][TIL]|P[0O]T|[0OQ]{1,2}[TIL])(?![A-Z0-9])/;

/** Text after the first DOT marker (anything before it dropped), or null when there is none. Uppercase input. */
export function textAfterDotMarker(upper: string): string | null {
  const m = DOT_MARKER.exec(upper);
  return m ? upper.slice(m.index + m[0].length).trimStart() : null;
}

export type ParsedDotAge = { week: number; year: number; ageYears: number; ageMonths: number };

export function parseDotAge(tin: string, now = new Date()): ParsedDotAge | null {
  const clean = tin.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/(\d{2})(\d{2})$/);
  if (!match) return null;
  const week = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (week < 1 || week > 53 || year > now.getFullYear()) return null;
  const made = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  let months =
    (now.getUTCFullYear() - made.getUTCFullYear()) * 12 + now.getUTCMonth() - made.getUTCMonth();
  if (now.getUTCDate() < made.getUTCDate()) months -= 1;
  if (months < 0) return null;
  return { week, year, ageYears: Math.floor(months / 12), ageMonths: months % 12 };
}
