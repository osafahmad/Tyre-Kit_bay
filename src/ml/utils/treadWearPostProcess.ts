import { isTreadWearClass, TREAD_WEAR_CLASSES, type TreadWearClass } from '../config/treadWearConfig';
import { decodeYoloDetections } from '../inference/tensorUtils';
import type { Detection } from '../inference/types';
import type { YoloDetectorManifestEntry } from '../manifest';

// Tread wear model output → wear detections. Decoding and greedy per-class
// NMS are the shared YOLOv8 implementation (`decodeYoloDetections`), so the
// sidewall and tread detectors can't drift apart. This file adds the tread
// specifics: typed labels and 0–1 boxes clamped to the model input.

/** Box as [x, y, width, height], 0–1 of the (letterboxed) model input. */
export type NormalisedBox = [x: number, y: number, width: number, height: number];

export type TreadWearDetection = {
  bbox: NormalisedBox;
  label: TreadWearClass;
  confidence: number;
};

/** The model's `[1, 18, 1029]` output: raw bytes, a flat array, or nested arrays. */
export type TreadWearOutput = ArrayBuffer | Float32Array | ArrayLike<ArrayLike<ArrayLike<number>>>;

export type TreadWearThresholds = { confidenceThreshold?: number; iouThreshold?: number };

/** Output in any accepted form → float32 bytes, checked against the manifest shape. */
function toBuffer(output: TreadWearOutput, shape: number[]): ArrayBuffer {
  // Tag checks, not `instanceof`: buffers from native (JSI) or another realm fail `instanceof`.
  const tag = Object.prototype.toString.call(output);
  if (tag === '[object ArrayBuffer]') return output as ArrayBuffer;
  if (tag === '[object Float32Array]') {
    // Copy: the array may be a view into a larger buffer.
    return (output as Float32Array).slice().buffer as ArrayBuffer;
  }
  output = output as ArrayLike<ArrayLike<ArrayLike<number>>>;
  const [batch, rows, anchors] = shape;
  if (output.length !== batch) throw new Error(`Output batch is ${output.length}, expected ${batch}.`);
  const flat = new Float32Array(batch * rows * anchors);
  let i = 0;
  for (let n = 0; n < batch; n++) {
    const sample = output[n];
    if (sample.length !== rows) throw new Error(`Output has ${sample.length} rows, expected ${rows}.`);
    for (let r = 0; r < rows; r++) {
      const row = sample[r];
      if (row.length !== anchors) {
        throw new Error(`Output row ${r} has ${row.length} anchors, expected ${anchors}.`);
      }
      for (let a = 0; a < anchors; a++) flat[i++] = row[a];
    }
  }
  return flat.buffer;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Model-input pixel corners → [x, y, w, h] in 0–1, clamped to the input.
 * Null when nothing is left inside it.
 */
export function normaliseBox(d: Detection, inputWidth: number, inputHeight: number): NormalisedBox | null {
  const x1 = clamp01(d.x1 / inputWidth);
  const y1 = clamp01(d.y1 / inputHeight);
  const x2 = clamp01(d.x2 / inputWidth);
  const y2 = clamp01(d.y2 / inputHeight);
  if (!(x2 > x1 && y2 > y1)) return null;
  return [x1, y1, x2 - x1, y2 - y1];
}

/** Model input width and height from the manifest entry. */
export function inputSize(entry: YoloDetectorManifestEntry): { width: number; height: number } {
  const [, a, b, c] = entry.inputShape;
  return entry.inputLayout === 'NCHW' ? { width: c, height: b } : { width: b, height: a };
}

/**
 * Decodes one tread wear output: for each of the 1029 anchors, the best of the
 * 14 class scores; anchors below the confidence threshold are dropped, then
 * greedy NMS per class at the IoU threshold. Boxes are clamped after NMS, as
 * Ultralytics does. Sorted by confidence, highest first.
 *
 * `thresholds` overrides the manifest values (e.g. for calibration).
 * Throws if the output doesn't match the manifest shape, or the manifest
 * labels aren't the tread wear classes.
 */
export function parseTreadWearOutput(
  output: TreadWearOutput,
  entry: YoloDetectorManifestEntry,
  thresholds: TreadWearThresholds = {},
): TreadWearDetection[] {
  if (
    entry.labels.length !== TREAD_WEAR_CLASSES.length ||
    entry.labels.some((l, i) => l !== TREAD_WEAR_CLASSES[i])
  ) {
    throw new Error('Manifest labels are not the tread wear classes.');
  }
  const decoded = decodeYoloDetections(toBuffer(output, entry.outputShape), {
    ...entry,
    confidenceThreshold: thresholds.confidenceThreshold ?? entry.confidenceThreshold,
    iouThreshold: thresholds.iouThreshold ?? entry.iouThreshold,
  });
  const { width, height } = inputSize(entry);
  const out: TreadWearDetection[] = [];
  for (const d of decoded) {
    const bbox = normaliseBox(d, width, height);
    if (!bbox || !isTreadWearClass(d.label)) continue;
    out.push({ bbox, label: d.label, confidence: d.score });
  }
  return out;
}
