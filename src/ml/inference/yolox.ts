import type { YoloxDetectorManifestEntry } from '../manifest';
import { nonMaxSuppression, readScores, tensorSpecFromManifest } from './tensorUtils';
import type { Detection, LetterboxInfo, PixelRect } from './types';

// YOLOX detection output decoding (boxes only, no masks). Every value comes
// from the manifest entry or the tensor; no model values live here.
//
// The bundled export decodes its own head: the grid offsets and strides are
// already applied in the graph and objectness is already multiplied into the
// class scores (docs/MODEL_CARD.md). So the tensor holds finished cx, cy, w, h
// and this file only thresholds, converts to corners and runs NMS. Applying
// the grid decode a second time here would move every box.

/** YOLOX heads predict on three feature maps (strides 8, 16, 32). */
export const YOLOX_STRIDES = [8, 16, 32] as const;

/** Anchor points a YOLOX head makes for an input size (one per grid cell), without running it. */
export function yoloxAnchorCount(width: number, height: number): number {
  return YOLOX_STRIDES.reduce((sum, s) => sum + Math.floor(width / s) * Math.floor(height / s), 0);
}

export type YoloxBoxFormat = YoloxDetectorManifestEntry['boxFormat'];

export type YoloxDecodeOptions = {
  /** Overrides for diagnostics; the manifest values are the defaults. */
  confidenceThreshold?: number;
  iouThreshold?: number;
  maxDetections?: number;
  boxFormat?: YoloxBoxFormat;
};

/**
 * Raw value ranges of the output, for the `[SidewallDetector]` readout. Read
 * over every anchor before any threshold, so they describe what the model
 * really returns (e.g. whether boxes are 0–1 or pixels).
 */
export type YoloxOutputStats = {
  anchors: number;
  /** Min and max over the 4 box rows (cx, cy, w, h). */
  boxes: { min: number; max: number };
  /** Highest score of each label over all anchors, in `labels` order. */
  classMax: Record<string, number>;
  /** Anchors whose best class score reaches the threshold (before NMS). */
  anchorsAboveThreshold: number;
};

type Range = { min: number; max: number };

const range = (values: Float32Array, from: number, to: number): Range => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = from; i < to; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const roundRange = (r: Range): Range => ({ min: round3(r.min), max: round3(r.max) });

function readDetections(output: ArrayBuffer, entry: YoloxDetectorManifestEntry) {
  const [, attributes, anchors] = entry.outputs.detections.shape;
  const values = readScores(output, entry.outputType, entry.outputQuantization);
  if (values.length !== attributes * anchors) {
    throw new Error(`Detections output has ${values.length} values; expected ${attributes * anchors}.`);
  }
  return { values, attributes, anchors };
}

/** Value ranges of the raw output (see `YoloxOutputStats`). */
export function yoloxOutputStats(
  detectionsOutput: ArrayBuffer,
  entry: YoloxDetectorManifestEntry,
  confidenceThreshold: number = entry.confidenceThreshold,
): YoloxOutputStats {
  const { values, anchors } = readDetections(detectionsOutput, entry);
  const labels = entry.labels.length;
  const classMax: Record<string, number> = {};
  let above = 0;
  for (let j = 0; j < anchors; j++) {
    let best = -Infinity;
    for (let c = 0; c < labels; c++) {
      const v = values[(4 + c) * anchors + j];
      if (v > best) best = v;
    }
    if (best >= confidenceThreshold) above++;
  }
  entry.labels.forEach((label, c) => {
    classMax[label] = round3(range(values, (4 + c) * anchors, (5 + c) * anchors).max);
  });
  return {
    anchors,
    boxes: roundRange(range(values, 0, 4 * anchors)),
    classMax,
    anchorsAboveThreshold: above,
  };
}

/**
 * The box format the raw values really use. Normalised boxes never exceed 1
 * (plus a little slack for boxes that overhang the padding); pixel boxes on a
 * 640 input reach the hundreds. Null when the range decides nothing (e.g. an
 * empty or all-zero output).
 */
export function inferBoxFormat(stats: Pick<YoloxOutputStats, 'boxes'>): YoloxBoxFormat | null {
  if (!Number.isFinite(stats.boxes.max) || stats.boxes.max <= 0) return null;
  return stats.boxes.max > 1.5 ? 'cxcywh_pixels' : 'cxcywh_normalised';
}

/**
 * YOLOX output → boxes in model-input pixels.
 * - Reads `[1, 4 + labels, anchors]` attribute-major: rows 0–3 are cx, cy, w,
 *   h, then one score row per label.
 * - Each anchor takes its best label. The scores already are objectness ×
 *   class probability, so they are used as they are. Anchors below the
 *   confidence threshold and zero-size boxes are dropped.
 * - Boxes are cx, cy, w, h in input pixels (`cxcywh_pixels`, the bundled
 *   export) or in 0–1 of the input, then clamped to the input.
 * - Greedy NMS per label at `iouThreshold`, at most `maxDetections` (YOLOX's
 *   own post-processing is per class too, not class-agnostic).
 */
export function decodeYoloxOutput(
  detectionsOutput: ArrayBuffer,
  entry: YoloxDetectorManifestEntry,
  options: YoloxDecodeOptions = {},
): Detection[] {
  const { values, anchors } = readDetections(detectionsOutput, entry);
  const labels = entry.labels.length;
  const confidence = options.confidenceThreshold ?? entry.confidenceThreshold;
  const iouThreshold = options.iouThreshold ?? entry.iouThreshold;
  const maxDetections = options.maxDetections ?? entry.maxDetections;
  const boxFormat = options.boxFormat ?? entry.boxFormat;
  const { width: inW, height: inH } = tensorSpecFromManifest(entry);
  const sx = boxFormat === 'cxcywh_normalised' ? inW : 1;
  const sy = boxFormat === 'cxcywh_normalised' ? inH : 1;
  const clampTo = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);

  const candidates: Detection[] = [];
  for (let j = 0; j < anchors; j++) {
    let best = 0;
    let score = values[4 * anchors + j];
    for (let c = 1; c < labels; c++) {
      const v = values[(4 + c) * anchors + j];
      if (v > score) {
        score = v;
        best = c;
      }
    }
    if (!(score >= confidence)) continue;
    const cx = values[j] * sx;
    const cy = values[anchors + j] * sy;
    const w = values[2 * anchors + j] * sx;
    const h = values[3 * anchors + j] * sy;
    const x1 = clampTo(cx - w / 2, inW);
    const y1 = clampTo(cy - h / 2, inH);
    const x2 = clampTo(cx + w / 2, inW);
    const y2 = clampTo(cy + h / 2, inH);
    if (!(x2 > x1 && y2 > y1)) continue;
    candidates.push({ label: entry.labels[best], labelIndex: best, score, x1, y1, x2, y2 });
  }
  return nonMaxSuppression(candidates, iouThreshold, maxDetections);
}

/**
 * A detection's box in the saved frame's pixels: undoes the letterbox scale
 * and padding and clips to the frame. Null when the box lies entirely in the
 * padding or has no area left.
 */
export function detectionToFrameRect(d: Detection, letterbox: LetterboxInfo): PixelRect | null {
  const { scale, padX, padY, sourceWidth, sourceHeight } = letterbox;
  const clampX = (v: number) => Math.min(Math.max((v - padX) / scale, 0), sourceWidth);
  const clampY = (v: number) => Math.min(Math.max((v - padY) / scale, 0), sourceHeight);
  const x1 = clampX(d.x1);
  const y1 = clampY(d.y1);
  const x2 = clampX(d.x2);
  const y2 = clampY(d.y2);
  if (!(x2 > x1 && y2 > y1)) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
