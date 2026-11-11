import { DOT_MARKER, TYRE_SIZE_PATTERN, parseTyreSize } from './ocr/parsers';
import {
  FULL_FRAME_SIZE_LIMITS,
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
 *   width/aspect and a rim read up to two lines away are joined (`recoverSize`).
 * - DOT/TIN: a line with a DOT marker (`DOT`, or the misreads `D0T`/`OOT`/`DTS`),
 *   alone or joined with the next line, 8–13 letters and digits ending in a
 *   valid week/year (`fullFrameDotCandidate`).
 * - Make: a `tyreBrands.ts` name read exactly, as a whole word
 *   (`fullFrameMakeCandidate`); else a token containing one of the
 *   `BRAND_ROOTS`, then a `MODEL_FAMILY_BRANDS` word such as `Contact`
 *   (owner decisions 2026-11-10). No other fuzzy matching.
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
const RIM_THEN_LOAD_SPEED = new RegExp(`(?:^|[^A-Z])Z?[RB]\\s?(\\d{2})\\s*${LOAD_SPEED}`);

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

/**
 * Owner decision 2026-11-10 (iPhone 13 logs: curved embossing split
 * `Continental` into `tinentals`, `inental`, `Lental`, …). When no listed
 * brand is read whole, a token that contains one of these roots (any case,
 * 6+ letters, each unique to one brand) gives that brand's listed name. No
 * edit distance and no shorter fragments: `inental` or `ienla` still give
 * nothing. Add roots here only with the owner's approval (CLAUDE.md).
 */
export const BRAND_ROOTS: readonly { root: string; brand: string }[] = [
  { root: 'TINENTAL', brand: 'Continental' },
  // Round 2 (iPhone 13: `ntinenals`, `tinenlal`). `TINEN` is 5 letters, below the 6 above.
  { root: 'NENTAL', brand: 'Continental' },
  { root: 'TINEN', brand: 'Continental' },
  { root: 'ICHELIN', brand: 'Michelin' },
  { root: 'BRIDGEST', brand: 'Bridgestone' },
  { root: 'GOODYEAR', brand: 'Goodyear' },
];

/**
 * Owner decision 2026-11-10 (iPhone 13 logs: `Contact`, `orContact`,
 * `ComfortContact` in every frame). Model-family words that only one listed
 * brand uses. Tried last, only when no brand name or brand root was read.
 * The value is the brand, never the model. Add words only with the owner's
 * approval (CLAUDE.md).
 */
export const MODEL_FAMILY_BRANDS: readonly { root: string; brand: string }[] = [
  { root: 'CONTACT', brand: 'Continental' },
];

function rootCandidate(lines: OcrLineLike[], roots: readonly { root: string; brand: string }[]): string | null {
  for (const line of [...lines].sort((a, b) => b.frame.height - a.frame.height)) {
    const upper = line.text.toUpperCase();
    const hit = roots.find(r => upper.includes(r.root));
    if (hit) return hit.brand;
  }
  return null;
}

/** Make from a `BRAND_ROOTS` root inside any token; the most prominent (tallest) line first. */
export const brandRootCandidate = (lines: OcrLineLike[]) => rootCandidate(lines, BRAND_ROOTS);

/** Make from a `MODEL_FAMILY_BRANDS` word inside any token; the most prominent (tallest) line first. */
export const modelFamilyBrandCandidate = (lines: OcrLineLike[]) => rootCandidate(lines, MODEL_FAMILY_BRANDS);

/** Size, DOT/TIN, make and load/speed from one whole sidewall frame's ML Kit lines. */
export function filterSidewallText(lines: OcrLineLike[], now: Date = new Date()): SidewallTextReading {
  const size = rankedSizeCandidate(lines);
  return {
    size: size?.value ?? null,
    dotTin: fullFrameDotCandidate(lines, now),
    make: fullFrameMakeCandidate(lines) ?? brandRootCandidate(lines) ?? modelFamilyBrandCandidate(lines),
    loadSpeed: size?.loadSpeed ?? null,
  };
}

/** Width/aspect-shaped text (`205/55`, `95/55`), to say why no size was taken. */
const WIDTH_ASPECT_SHAPE = /\d{2,3}\s*\/\s*\d{2}/;
/** A 3-digit width/aspect whose width is below 100 or above 395 (`495/35`): read, but never corrected. */
const WIDTH_ASPECT_OUTSIDE_LIMITS = /(?:^|[^0-9])(0\d\d|[4-9]\d\d)\s*\/\s*(\d{2})(?!\d)/;

/**
 * Diagnostics only: why each field in `reading` is empty, as short reasons for
 * the `[SidewallOCR]` log. Fields that were read are left out.
 */
export function explainRejections(
  lines: OcrLineLike[],
  reading: SidewallTextReading,
): Partial<Record<'size' | 'dotTin' | 'make', string>> {
  const texts = lines.map(l => l.text.toUpperCase());
  const why: Partial<Record<'size' | 'dotTin' | 'make', string>> = {};
  if (lines.length === 0) return { size: 'no text', dotTin: 'no text', make: 'no text' };
  if (!reading.size) {
    const parsed = texts.map(t => parseTyreSize(t)).find(p => p !== null);
    const shaped = texts.find(t => WIDTH_ASPECT_SHAPE.test(t));
    const outside = texts.map(t => WIDTH_ASPECT_OUTSIDE_LIMITS.exec(t)).find(m => m !== null);
    const [minWidth, maxWidth] = FULL_FRAME_SIZE_LIMITS.width;
    why.size = parsed
      ? `regex matched "${parsed.value}" but it is outside the size limits`
      : outside
        ? `width/aspect "${outside[1]}/${outside[2]}" read but the width is outside ${minWidth}–${maxWidth} mm (not completed or corrected)`
        : shaped
          ? `width/aspect-shaped text "${shaped}" but no full size on its line and no rim 13–22 read within two lines`
          : 'no size-shaped text (regex mismatch)';
  }
  if (!reading.dotTin) {
    const dot = texts.find(t => DOT_MARKER.test(t));
    why.dotTin = dot
      ? `DOT line "${dot}" (+ next line) is not 8–13 letters/digits ending in a valid week/year`
      : 'no DOT marker read (DOT or a listed misread)';
  }
  if (!reading.make) why.make = 'no listed brand read as a whole word, no brand root, no model-family word';
  return why;
}
