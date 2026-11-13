import type { PixelRect } from '../inference/types';
import type { OcrLineLike } from '../ocr/textCandidates';
import { DOT_MARKER } from '../ocr/parsers';
import { markerlessTinCandidate } from '../ocr/sidewallFields';
import { filterSidewallText, type SidewallTextReading } from '../sidewallTextFilter';

// Stage 2 (owner task 2026-11-13): the pure parts of per-box crop OCR. The
// detector's box is padded and clamped to the frame, read by ML Kit in four
// orientations, and the orientation whose text fits the box's class best is
// kept. No native code here, so it is unit-tested directly.

/** Cushion added on each side of a detector box before cropping, as a fraction of its size (owner: ~12 %). */
export const CROP_PADDING_RATIO = 0.12;

/**
 * Orientations ML Kit reads each crop in. Sidewall text runs around the tyre,
 * so a box on the side arcs holds vertical text and one on the bottom arc
 * holds upside-down text. 90 = clockwise, -90 = counter-clockwise (nitro-image).
 */
export const CROP_ROTATIONS = [0, 90, -90, 180] as const;
export type CropRotation = (typeof CROP_ROTATIONS)[number];

export type CropRect = { x1: number; y1: number; x2: number; y2: number };

/**
 * The detector box with `ratio` of its width and height added on every side,
 * in whole pixels, clamped to the frame. Null when nothing is left.
 */
export function paddedCropRect(
  rect: PixelRect,
  frame: { width: number; height: number },
  ratio: number = CROP_PADDING_RATIO,
): CropRect | null {
  const padX = rect.width * ratio;
  const padY = rect.height * ratio;
  const x1 = Math.max(0, Math.floor(rect.x - padX));
  const y1 = Math.max(0, Math.floor(rect.y - padY));
  const x2 = Math.min(frame.width, Math.ceil(rect.x + rect.width + padX));
  const y2 = Math.min(frame.height, Math.ceil(rect.y + rect.height + padY));
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
