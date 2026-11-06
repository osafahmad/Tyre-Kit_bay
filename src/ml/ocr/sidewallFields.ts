import type { SidewallDetails } from '../../features/inspection/types';
import { parseDotAge, parseTyreSize } from './parsers';
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
  return parseTyreSize(ordered.map(l => l.text).join(' '))?.value ?? null;
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
  const text = readingOrder(lines)
    .map(l => l.text)
    .join(' ')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^DOT\s*/, '');
  const chars = text.replace(/ /g, '');
  if (chars.length < DOT_MIN_CHARS || chars.length > DOT_MAX_CHARS) return null;
  if (!/\d{4}$/.test(chars) || !parseDotAge(chars, now)) return null;
  return text;
}

/**
 * Make / Model: the most prominent line (tallest text) with at least two
 * letters, as read, with spacing tidied. 2 to 30 characters.
 */
export function nameCandidate(lines: OcrLineLike[]): string | null {
  const usable = lines
    .map(l => ({ line: l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter(({ text }) => (text.match(/[A-Za-z]/g)?.length ?? 0) >= 2 && text.length <= 30);
  if (usable.length === 0) return null;
  usable.sort((a, b) => b.line.frame.height - a.line.frame.height);
  return usable[0].text;
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
      return dotCandidate(lines, now);
    case 'make':
    case 'model':
      return nameCandidate(lines);
  }
}

/** Reads compare without case or spaces, so `MICHELIN` and `Michelin` agree. */
export const readKey = (value: string) => value.toUpperCase().replace(/\s+/g, '');

export type FieldRead = { value: string; score: number };

/**
 * The value read the most times, if at least `minAgreeing` reads agree.
 * Ties go to the higher total detector score. The returned text is the
 * best-scoring read of that value, exactly as read.
 */
export function agreedValue(reads: FieldRead[], minAgreeing: number): string | null {
  const groups = new Map<string, { count: number; total: number; best: FieldRead }>();
  for (const r of reads) {
    const key = readKey(r.value);
    const g = groups.get(key);
    if (!g) groups.set(key, { count: 1, total: r.score, best: r });
    else {
      g.count += 1;
      g.total += r.score;
      if (r.score > g.best.score) g.best = r;
    }
  }
  let winner: { count: number; total: number; best: FieldRead } | null = null;
  for (const g of groups.values()) {
    if (!winner || g.count > winner.count || (g.count === winner.count && g.total > winner.total)) {
      winner = g;
    }
  }
  return winner && winner.count >= minAgreeing ? winner.best.value : null;
}
