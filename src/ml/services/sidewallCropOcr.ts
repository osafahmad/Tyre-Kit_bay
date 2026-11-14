import type { PixelRect } from '../inference/types';
import type { OcrLineLike } from '../ocr/textCandidates';
import { DOT_MARKER } from '../ocr/parsers';
import { markerlessTinCandidate } from '../ocr/sidewallFields';
import { filterSidewallText, type SidewallTextReading } from '../sidewallTextFilter';

// Stage 2 (owner task 2026-11-13): the pure parts of per-box crop OCR. The
// detector's box is cropped axis-aligned with a small pixel margin, clamped to
// the frame, read by ML Kit in four orientations, and the orientation whose
// text fits the box's class best is kept. No native code here, so it is
// unit-tested directly.

/**
 * Margin added on each side of a detector box before cropping, in
 * detector-input pixels (owner brief 2026-11-14: a safe 5–10 px; it replaced
 * the 12 % cushion of 2026-11-13). Measured where the detector's box error
 * lives, so it is scaled up to saved-frame pixels by `cropMarginForFrame`.
 */
export const CROP_PADDING_INPUT_PX = 8;

/**
 * The crop margin in saved-frame pixels: `CROP_PADDING_INPUT_PX` with the
 * letterbox scale undone (a 1280 px frame on a 640 input has scale 0.5, so
 * 8 px becomes 16). Without a scale the margin is used as it is.
 */
export function cropMarginForFrame(
  letterboxScale: number | null | undefined,
  inputPx: number = CROP_PADDING_INPUT_PX,
): number {
  return letterboxScale && letterboxScale > 0 ? inputPx / letterboxScale : inputPx;
}

/**
 * Orientations ML Kit reads each crop in. Sidewall text runs around the tyre,
 * so a box on the side arcs holds vertical text and one on the bottom arc
 * holds upside-down text. 90 = clockwise, -90 = counter-clockwise (nitro-image).
 */
export const CROP_ROTATIONS = [0, 90, -90, 180] as const;
export type CropRotation = (typeof CROP_ROTATIONS)[number];

export type CropRect = { x1: number; y1: number; x2: number; y2: number };

/**
 * The detector box, axis-aligned, with `margin` saved-frame pixels added on
 * every side, in whole pixels, clamped to the frame. Null when the box itself
 * is under a pixel wide or high inside the frame: the margin alone is never
 * cropped and read.
 */
export function paddedCropRect(
  rect: PixelRect,
  frame: { width: number; height: number },
  margin: number = CROP_PADDING_INPUT_PX,
): CropRect | null {
  const insideW = Math.min(frame.width, rect.x + rect.width) - Math.max(0, rect.x);
  const insideH = Math.min(frame.height, rect.y + rect.height) - Math.max(0, rect.y);
  if (!(insideW >= 1 && insideH >= 1)) return null;
  const x1 = Math.max(0, Math.floor(rect.x - margin));
  const y1 = Math.max(0, Math.floor(rect.y - margin));
  const x2 = Math.min(frame.width, Math.ceil(rect.x + rect.width + margin));
  const y2 = Math.min(frame.height, Math.ceil(rect.y + rect.height + margin));
  return x2 - x1 >= 2 && y2 - y1 >= 2 ? { x1, y1, x2, y2 } : null;
}

export type CropRead = {
  rotation: CropRotation;
  lines: OcrLineLike[];
  /** The lines' text, in reading order, joined with ` | ` for display and logs. */
  text: string;
  reading: SidewallTextReading;
  /** How well the text fits the box's class (see `scoreCropRead`). */
  score: number;
};

/** The field a detector class should contain. */
export const FIELD_FOR_LABEL: Record<string, keyof Pick<SidewallTextReading, 'size' | 'dotTin' | 'make' | 'model'>> = {
  Brand: 'make',
  DOT: 'dotTin',
  Model: 'model',
  Size: 'size',
};

const alphanumerics = (lines: OcrLineLike[]) => lines.reduce((n, l) => n + (l.text.match(/[A-Za-z0-9]/g)?.length ?? 0), 0);

/**
 * Class-appropriate strength of one orientation's text:
 * - 3: the class's own field was parsed (a size, a validated DOT/TIN, a listed
 *   brand, a listed model family).
 * - 2: a weaker sign of the class: a partial size (`/60 R17 96H`), a DOT
 *   marker or a TIN-shaped line, or a listed model code alone.
 * - 1: some letters or digits were read; 0: nothing.
 * Plus a fraction for the amount of text read, so ties go to the fuller read.
 * The parsers are the shared ones, so no regex is re-written here.
 */
export function scoreCropRead(label: string, lines: OcrLineLike[], reading: SidewallTextReading, now: Date): number {
  const count = alphanumerics(lines);
  if (count === 0) return 0;
  const field = FIELD_FOR_LABEL[label];
  let level = 1;
  if (field && reading[field]) level = 3;
  else if (label === 'Size' && reading.sizePartial) level = 2;
  else if (label === 'DOT' && (lines.some(l => DOT_MARKER.test(l.text.toUpperCase())) || markerlessTinCandidate(lines, now))) level = 2;
  else if (label === 'Model' && reading.modelCode) level = 2;
  return level + Math.min(count, 99) / 100;
}

/** One orientation's OCR lines → a scored read. */
export function cropRead(label: string, rotation: CropRotation, lines: OcrLineLike[], now: Date = new Date()): CropRead {
  const reading = filterSidewallText(lines, now);
  const text = lines.map(l => l.text.trim()).filter(Boolean).join(' | ');
  return { rotation, lines, text, reading, score: scoreCropRead(label, lines, reading, now) };
}

/** The read that fits the class best; the earlier orientation wins a tie. Null with no reads. */
export function bestCropRead(reads: CropRead[]): CropRead | null {
  let best: CropRead | null = null;
  for (const r of reads) if (!best || r.score > best.score) best = r;
  return best;
}

// ---------------------------------------------------------------- Stage 3: which boxes count

/**
 * A crop whose best read reached this score parsed its own class's field
 * (`scoreCropRead`: 3 + text bonus), so it is "strongly verified".
 */
export const CROP_STRONG_SCORE = 3;
/**
 * estimate. Two boxes of different classes whose padded crops overlap by at
 * least this IoU are taken as the same text; a weak one never competes with a
 * strongly verified one.
 */
export const CROP_OVERLAP_IOU = 0.5;

/** Why a crop is left out of the field suggestions. Null: it is used. */
export type CropIgnoredReason = 'no_text' | 'overlap';

type JudgedCrop = { label: string; crop: CropRect; best: CropRead | null };

/** Intersection over union of two crop rectangles. */
export function cropIou(a: CropRect, b: CropRect): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Stage 3 (owner request 2026-11-13, iPhone 13: false `Brand` boxes on tread
 * shoulder rubber read 0 characters in all 4 orientations):
 * - `verified`: at least one orientation read a letter or digit (best score > 0).
 *   An unverified box is ignored as `no_text`.
 * - A verified box that overlaps (IoU ≥ `CROP_OVERLAP_IOU`) a box of another
 *   class that parsed its own field, while it didn't parse its own, is
 *   ignored as `overlap`, with the index of the box that won.
 * Ignored boxes stay in the results so the staging card can show them.
 */
export function judgeCrops<T extends JudgedCrop>(
  crops: T[],
): (T & { verified: boolean; ignored: CropIgnoredReason | null; overlappedBy: number | null })[] {
  const verified = crops.map(c => !!c.best && c.best.score > 0);
  const strong = crops.map((c, i) => verified[i] && c.best!.score >= CROP_STRONG_SCORE);
  return crops.map((c, i) => {
    if (!verified[i]) return { ...c, verified: false, ignored: 'no_text' as const, overlappedBy: null };
    if (!strong[i]) {
      const winner = crops.findIndex(
        (o, j) => j !== i && strong[j] && o.label !== c.label && cropIou(o.crop, c.crop) >= CROP_OVERLAP_IOU,
      );
      if (winner >= 0) return { ...c, verified: true, ignored: 'overlap' as const, overlappedBy: winner };
    }
    return { ...c, verified: true, ignored: null, overlappedBy: null };
  });
}
