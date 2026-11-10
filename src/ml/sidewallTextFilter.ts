import { TYRE_SIZE_PATTERN, parseTyreSize } from './ocr/parsers';
import {
  fullFrameDotCandidate,
  fullFrameMakeCandidate,
  readingOrder,
  recoverSize,
  sizeWithinLimits,
} from './ocr/sidewallFields';
import type { OcrLineLike } from './ocr/textCandidates';

/**
 * Semantic and spatial filter for one whole sidewall frame read by ML Kit
 * (no TFLite text detector, DECISIONS.md "Sidewall text without a detector").
 * A sidewall frame has lots of other moulded text (max load / pressure,
 * TREADWEAR, plant codes, rim stamps), so only strict patterns are taken:
 *
 * - Size: `parseTyreSize` per line, within `FULL_FRAME_SIZE_LIMITS`. Several
 *   matches are ranked (`rankedSizeCandidate`). With no single-line match,
 *   width/aspect and rim read on adjacent lines are joined (`recoverSize`).
 * - DOT/TIN: a line with the word `DOT`, alone or joined with the next line,
 *   8–13 letters and digits ending in a valid week/year (`fullFrameDotCandidate`).
 * - Make: a `tyreBrands.ts` name read exactly, as a whole word
 *   (`fullFrameMakeCandidate`). Fuzzy and logo-fragment matching are allowed
 *   only inside a detector Brand crop (CLAUDE.md), so they don't run here.
 * - Load index / speed symbol (`91V`): read right after the size. Used to rank
 *   size reads; it isn't a sidewall field (spec §5), so it's never saved.
 *
 * Model is never read from a whole frame: picking which text is the model
 * would be a guess. Nothing is swapped, completed or corrected beyond the
 * CLAUDE.md exceptions inside the parsers it calls.
 *
 * ML Kit on this package gives no per-line confidence, so "more trustworthy"
 * means a size followed by a load/speed index, then taller (more prominent) text.
 */
export type SidewallTextReading = {
  size: string | null;
  dotTin: string | null;
  make: string | null;
  /** Load index (or dual `121/119`) and speed symbol read after the size, e.g. `91V`. */
  loadSpeed: string | null;
};

/** ISO 4000 / ETRTO speed symbols (I, O and X aren't used). */
const SPEED = '[A-HJ-NP-WYZ]';
/** Load index (single or dual) then a speed symbol, optionally in brackets, as a whole token. */
const LOAD_SPEED = `(\\d{2,3}(?:\\/\\d{2,3})?)\\s?\\(?(${SPEED})\\)?(?![A-Z0-9])`;
const LOAD_SPEED_AT_START = new RegExp(`^\\s*${LOAD_SPEED}`);
/** A rim token followed by a load/speed index, on a line of its own (`R16 91V`). */
const RIM_THEN_LOAD_SPEED = new RegExp(`(?:^|[^A-Z0-9])Z?R\\s?(\\d{2})\\s*${LOAD_SPEED}`);

/** ISO load index table: 0–279. */
const LOAD_INDEX_MAX = 279;

function loadSpeedFrom(match: RegExpExecArray | null, loadGroup: number): string | null {
  if (!match) return null;
  const load = match[loadGroup];
  const speed = match[loadGroup + 1];
  if (load.split('/').some(n => Number(n) > LOAD_INDEX_MAX)) return null;
  return `${load}${speed}`;
}

/** Load/speed index read directly after a single-line size match on this text, or null. */
export function loadSpeedAfterSize(text: string): string | null {
  const upper = text.toUpperCase();
  const size = TYRE_SIZE_PATTERN.exec(upper);
  if (!size) return null;
  return loadSpeedFrom(LOAD_SPEED_AT_START.exec(upper.slice(size.index + size[0].length)), 1);
}

type SizeRead = { value: string; loadSpeed: string | null; height: number; order: number };

/**
 * Best single-line size in a frame. A line whose size is followed by a
 * load/speed index beats one without (rim stamps, part numbers and stray
 * `100/45 R15`-like text don't carry one), then taller text, then reading
 * order. Falls back to `recoverSize` (split lines) when no line has a size.
 */
export function rankedSizeCandidate(lines: OcrLineLike[]): { value: string; loadSpeed: string | null } | null {
  const reads: SizeRead[] = [];
  readingOrder(lines).forEach((line, order) => {
    const p = parseTyreSize(line.text);
    if (!p || !sizeWithinLimits(p)) return;
    reads.push({ value: p.value, loadSpeed: loadSpeedAfterSize(line.text), height: line.frame.height, order });
  });
  reads.sort(
    (a, b) =>
      Number(b.loadSpeed !== null) - Number(a.loadSpeed !== null) || b.height - a.height || a.order - b.order,
  );
  if (reads.length > 0) return { value: reads[0].value, loadSpeed: reads[0].loadSpeed };

  const recovered = recoverSize(lines);
  if (!recovered) return null;
  // Split size: the load/speed index sits after the rim on the rim's own line.
  const rim = parseTyreSize(recovered)!.rimInches;
  for (const line of lines) {
    const m = RIM_THEN_LOAD_SPEED.exec(line.text.toUpperCase());
    if (m && Number(m[1]) === rim) return { value: recovered, loadSpeed: loadSpeedFrom(m, 2) };
  }
  return { value: recovered, loadSpeed: null };
}

/** Size, DOT/TIN, make and load/speed from one whole sidewall frame's ML Kit lines. */
export function filterSidewallText(lines: OcrLineLike[], now: Date = new Date()): SidewallTextReading {
  const size = rankedSizeCandidate(lines);
  return {
    size: size?.value ?? null,
    dotTin: fullFrameDotCandidate(lines, now),
    make: fullFrameMakeCandidate(lines),
    loadSpeed: size?.loadSpeed ?? null,
  };
}
