import type { YoloSegDetectorManifestEntry } from '../manifest';
import { nonMaxSuppression, readScores, tensorSpecFromManifest } from './tensorUtils';
import type { Detection, LetterboxInfo, PixelRect } from './types';

// Ultralytics YOLO segmentation output decoding (Stage 1: boxes only). Every
// value comes from the manifest entry or the tensors; no model values live here.

/** Ultralytics detection heads predict on the P3, P4 and P5 feature maps (strides 8, 16, 32). */
export const YOLO_STRIDES = [8, 16, 32] as const;

/** Anchors a YOLO head makes for an input size, without running it. */
export function yoloAnchorCount(width: number, height: number): number {
  return YOLO_STRIDES.reduce((sum, s) => sum + Math.floor(width / s) * Math.floor(height / s), 0);
}

export type YoloBoxFormat = YoloSegDetectorManifestEntry['boxFormat'];

/** One detection after NMS, in model-input pixels, with its mask coefficients (Stage 4 uses them). */
export type SegDetection = Detection & { maskCoefficients: Float32Array };

export type YoloSegDecodeOptions = {
  /** Overrides for the staging card; the manifest values are the defaults. */
  confidenceThreshold?: number;
  iouThreshold?: number;
  maxDetections?: number;
  boxFormat?: YoloBoxFormat;
};

/**
 * Raw value ranges of the detections output, for the Stage 1 readout. Read
 * over every anchor before any threshold, so they describe what the model
 * really returns (e.g. whether boxes are 0–1 or pixels).
 */
export type YoloSegOutputStats = {
  anchors: number;
  /** Min and max over the 4 box rows (cx, cy, w, h). */
  boxes: { min: number; max: number };
  /** Highest score of each label over all anchors, in `labels` order. */
  classMax: Record<string, number>;
  /** Min and max over the mask coefficient rows. */
  maskCoefficients: { min: number; max: number };
  /** Min and max of the prototype tensor (null when it wasn't read). */
  prototypes: { min: number; max: number } | null;
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

function readDetections(output: ArrayBuffer, entry: YoloSegDetectorManifestEntry) {
  const [, attributes, anchors] = entry.outputs.detections.shape;
  const values = readScores(output, entry.outputType, entry.outputQuantization);
  if (values.length !== attributes * anchors) {
    throw new Error(`Detections output has ${values.length} values; expected ${attributes * anchors}.`);
  }
  return { values, attributes, anchors };
}

/** Value ranges of the raw outputs (see `YoloSegOutputStats`). */
export function yoloSegOutputStats(
  detectionsOutput: ArrayBuffer,
  prototypesOutput: ArrayBuffer | null,
  entry: YoloSegDetectorManifestEntry,
  confidenceThreshold: number = entry.confidenceThreshold,
): YoloSegOutputStats {
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
  const maskStart = (4 + labels) * anchors;
  const maskEnd = maskStart + entry.maskCoefficients * anchors;
  let prototypes: Range | null = null;
  if (prototypesOutput) {
    const protos = readScores(prototypesOutput, entry.outputType, entry.outputQuantization);
    prototypes = roundRange(range(protos, 0, protos.length));
  }
  return {
    anchors,
    boxes: roundRange(range(values, 0, 4 * anchors)),
    classMax,
    maskCoefficients: roundRange(range(values, maskStart, maskEnd)),
    prototypes,
    anchorsAboveThreshold: above,
  };
}

/**
 * The box format the raw values really use. Normalised boxes never exceed 1
 * (plus a little slack for boxes that overhang the padding); pixel boxes on a
 * 640 input reach the hundreds. Null when the range decides nothing (e.g. an
 * empty or all-zero output).
 */
export function inferBoxFormat(stats: Pick<YoloSegOutputStats, 'boxes'>): YoloBoxFormat | null {
  if (!Number.isFinite(stats.boxes.max) || stats.boxes.max <= 0) return null;
  return stats.boxes.max > 1.5 ? 'cxcywh_pixels' : 'cxcywh_normalised';
}

/**
 * Raw YOLO seg output → boxes in model-input pixels.
 * - Reads `[1, 4 + labels + maskCoefficients, anchors]` attribute-major.
 * - Each anchor takes its best label; the export already applies sigmoid, so
 *   scores are used as they are. Anchors below the confidence threshold and
 *   zero-size boxes are dropped.
 * - Boxes are cx, cy, w, h in 0–1 of the input (`cxcywh_normalised`) or in
 *   input pixels, then clamped to the input.
 * - Greedy NMS per label at `iouThreshold`, at most `maxDetections`
 *   (Ultralytics' default is per class, not class-agnostic).
 */
export function decodeYoloSegOutput(
  detectionsOutput: ArrayBuffer,
  entry: YoloSegDetectorManifestEntry,
  options: YoloSegDecodeOptions = {},
): SegDetection[] {
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
  const maskStart = 4 + labels;

  const candidates: SegDetection[] = [];
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
    const maskCoefficients = new Float32Array(entry.maskCoefficients);
    for (let m = 0; m < entry.maskCoefficients; m++) {
      maskCoefficients[m] = values[(maskStart + m) * anchors + j];
    }
    candidates.push({ label: entry.labels[best], labelIndex: best, score, x1, y1, x2, y2, maskCoefficients });
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
