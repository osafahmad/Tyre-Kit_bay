import {
  isTreadWearClass,
  TREAD_WEAR_BACKGROUND,
  TREAD_WEAR_CLASSES,
  type TreadWearClass,
} from '../config/treadWearConfig';
import { decodeSsdDetections, tensorSpecFromManifest } from '../inference/tensorUtils';
import type { Detection } from '../inference/types';
import type { SsdDetectorManifestEntry } from '../manifest';

// Tread wear model outputs → wear detections. Anchor decoding and greedy
// per-class NMS are the shared SSD implementation (`decodeSsdDetections`).
// This file adds the tread specifics: typed labels and 0–1 boxes.

/** Box as [x, y, width, height], 0–1 of the model input (= of the frame: the input is a plain stretch). */
export type NormalisedBox = [x: number, y: number, width: number, height: number];

export type TreadWearDetection = {
  bbox: NormalisedBox;
  label: TreadWearClass;
  confidence: number;
};

/** One output tensor (`raw_boxes` `[1, 3234, 4]` or `raw_scores` `[1, 3234, 16]`): raw bytes, a flat array, or nested arrays. */
export type SsdOutputTensor = ArrayBuffer | Float32Array | ArrayLike<ArrayLike<ArrayLike<number>>>;

export type TreadWearThresholds = { confidenceThreshold?: number; iouThreshold?: number };

/** Output in any accepted form → float32 bytes, checked against the manifest shape. */
function toBuffer(output: SsdOutputTensor, shape: number[], name: string): ArrayBuffer {
  // Tag checks, not `instanceof`: buffers from native (JSI) or another realm fail `instanceof`.
  const tag = Object.prototype.toString.call(output);
  if (tag === '[object ArrayBuffer]') return output as ArrayBuffer;
  if (tag === '[object Float32Array]') {
    // Copy: the array may be a view into a larger buffer.
    return (output as Float32Array).slice().buffer as ArrayBuffer;
  }
  const nested = output as ArrayLike<ArrayLike<ArrayLike<number>>>;
  const [batch, anchors, values] = shape;
  if (nested.length !== batch) throw new Error(`${name} batch is ${nested.length}, expected ${batch}.`);
  const flat = new Float32Array(batch * anchors * values);
  let i = 0;
  for (let n = 0; n < batch; n++) {
    const sample = nested[n];
    if (sample.length !== anchors) throw new Error(`${name} has ${sample.length} anchors, expected ${anchors}.`);
    for (let a = 0; a < anchors; a++) {
      const row = sample[a];
      if (row.length !== values) {
        throw new Error(`${name} anchor ${a} has ${row.length} values, expected ${values}.`);
      }
      for (let v = 0; v < values; v++) flat[i++] = row[v];
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

/** True when the manifest labels are the background followed by the tread wear classes, in order. */
export function hasTreadWearLabels(entry: SsdDetectorManifestEntry): boolean {
  const expected = [TREAD_WEAR_BACKGROUND, ...TREAD_WEAR_CLASSES];
  return (
    entry.backgroundIndex === 0 &&
    entry.labels.length === expected.length &&
    entry.labels.every((l, i) => l === expected[i])
  );
}

/**
 * Decodes one tread wear run: for each of the 3234 anchors, the best of the
 * 15 non-background classes (scores are already softmax probabilities);
 * anchors below the confidence threshold are dropped, boxes are decoded
 * against the torchvision anchors, then greedy NMS per class at the IoU
 * threshold. Sorted by confidence, highest first. `normal_even_wear` is
 * returned like any class; the feature layer decides it isn't a defect.
 *
 * `thresholds` overrides the manifest values (e.g. for calibration).
 * Throws if an output doesn't match the manifest shape, or the manifest
 * labels aren't the tread wear classes.
 */
export function parseTreadWearOutput(
  boxes: SsdOutputTensor,
  scores: SsdOutputTensor,
  entry: SsdDetectorManifestEntry,
  thresholds: TreadWearThresholds = {},
): TreadWearDetection[] {
  if (!hasTreadWearLabels(entry)) throw new Error('Manifest labels are not the tread wear classes.');
  const decoded = decodeSsdDetections(
    toBuffer(boxes, entry.outputs.boxes.shape, entry.outputs.boxes.name),
    toBuffer(scores, entry.outputs.scores.shape, entry.outputs.scores.name),
    {
      ...entry,
      confidenceThreshold: thresholds.confidenceThreshold ?? entry.confidenceThreshold,
      iouThreshold: thresholds.iouThreshold ?? entry.iouThreshold,
    },
  );
  const { width, height } = tensorSpecFromManifest(entry);
  const out: TreadWearDetection[] = [];
  for (const d of decoded) {
    const bbox = normaliseBox(d, width, height);
    if (!bbox || !isTreadWearClass(d.label)) continue;
    out.push({ bbox, label: d.label, confidence: d.score });
  }
  return out;
}
