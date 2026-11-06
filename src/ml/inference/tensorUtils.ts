import type {
  ClassifierManifestEntry,
  ModelManifest,
  Quantization,
  TensorDType,
  YoloDetectorManifestEntry,
} from '../manifest';
import type { Detection, LetterboxInfo, PixelRect, RawPixels, TensorSpec } from './types';

// Converts saved frames to model input tensors and model outputs to scores.
// Everything here follows the manifest; no model values live in this file.

type ManifestEntry = NonNullable<ModelManifest[keyof ModelManifest]>;

/** Input size and preprocessing from a manifest entry's `inputShape` and layout. */
export function tensorSpecFromManifest(entry: ManifestEntry): TensorSpec {
  const [, a, b, c] = entry.inputShape;
  const nhwc = entry.inputLayout === 'NHWC';
  return {
    height: nhwc ? a : b,
    width: nhwc ? b : c,
    layout: entry.inputLayout,
    dtype: entry.inputType,
    colorOrder: entry.colorOrder,
    resize: entry.resize,
    normalisation: entry.normalisation,
    quantization: entry.inputQuantization,
    padValue: entry.letterboxPadValue ?? 0,
  };
}

/** Byte offsets of R, G, B inside one pixel, and bytes per pixel. */
export function pixelLayout(
  format: string,
): { r: number; g: number; b: number; bytesPerPixel: number } | null {
  switch (format) {
    case 'RGB':
      return { r: 0, g: 1, b: 2, bytesPerPixel: 3 };
    case 'BGR':
      return { r: 2, g: 1, b: 0, bytesPerPixel: 3 };
    case 'RGBA':
    case 'RGBX':
      return { r: 0, g: 1, b: 2, bytesPerPixel: 4 };
    case 'BGRA':
    case 'BGRX':
      return { r: 2, g: 1, b: 0, bytesPerPixel: 4 };
    case 'ARGB':
    case 'XRGB':
      return { r: 1, g: 2, b: 3, bytesPerPixel: 4 };
    case 'ABGR':
    case 'XBGR':
      return { r: 3, g: 2, b: 1, bytesPerPixel: 4 };
    default:
      return null;
  }
}

const DTYPE_RANGE: Record<Exclude<TensorDType, 'float32'>, [number, number]> = {
  uint8: [0, 255],
  int8: [-128, 127],
};

function allocate(dtype: TensorDType, length: number): Float32Array | Uint8Array | Int8Array {
  if (dtype === 'float32') return new Float32Array(length);
  return dtype === 'uint8' ? new Uint8Array(length) : new Int8Array(length);
}

export function quantize(value: number, dtype: 'uint8' | 'int8', q: Quantization): number {
  const [lo, hi] = DTYPE_RANGE[dtype];
  const v = Math.round(value / q.scale) + q.zeroPoint;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Pixels already at the model's input size → input tensor bytes.
 * Handles row padding, channel order, normalisation, quantization and layout.
 */
export function pixelsToTensor(pixels: RawPixels, spec: TensorSpec): ArrayBuffer {
  if (pixels.width !== spec.width || pixels.height !== spec.height) {
    throw new Error(
      `Pixels are ${pixels.width}x${pixels.height}, the model needs ${spec.width}x${spec.height}.`,
    );
  }
  const layout = pixelLayout(pixels.pixelFormat);
  if (!layout) {
    throw new Error(`Unsupported pixel format: ${pixels.pixelFormat}`);
  }
  const { width: w, height: h } = spec;
  const rowBytes = pixels.buffer.byteLength / h;
  if (!Number.isInteger(rowBytes) || rowBytes < w * layout.bytesPerPixel) {
    throw new Error('Pixel buffer size does not match its width and height.');
  }
  if (spec.dtype !== 'float32' && !spec.quantization) {
    throw new Error(`A ${spec.dtype} input needs quantization values in the manifest.`);
  }

  const src = new Uint8Array(pixels.buffer);
  const out = allocate(spec.dtype, w * h * 3);
  const offsets =
    spec.colorOrder === 'RGB' ? [layout.r, layout.g, layout.b] : [layout.b, layout.g, layout.r];
  const mean = spec.normalisation?.mean ?? [0, 0, 0];
  const std = spec.normalisation?.std ?? [1, 1, 1];
  const plane = w * h;

  for (let y = 0; y < h; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < w; x++) {
      const p = row + x * layout.bytesPerPixel;
      const i = y * w + x;
      for (let c = 0; c < 3; c++) {
        let v = (src[p + offsets[c]] - mean[c]) / std[c];
        if (spec.dtype !== 'float32') {
          v = quantize(v, spec.dtype, spec.quantization!);
        }
        out[spec.layout === 'NHWC' ? i * 3 + c : c * plane + i] = v;
      }
    }
  }
  return out.buffer as ArrayBuffer;
}

/** Largest centred rectangle with the target aspect ratio. */
export function centerCropRect(
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  const target = targetWidth / targetHeight;
  if (width / height > target) {
    const w = Math.round(height * target);
    return { x: Math.floor((width - w) / 2), y: 0, width: w, height };
  }
  const h = Math.round(width / target);
  return { x: 0, y: Math.floor((height - h) / 2), width, height: h };
}

/**
 * Ultralytics letterbox geometry: scale to fit inside the target keeping the
 * aspect ratio, then centre with padding (Ultralytics' `round(d ± 0.1)` split).
 */
export function letterboxPlan(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): LetterboxInfo & { resizedWidth: number; resizedHeight: number } {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const resizedWidth = Math.min(targetWidth, Math.max(1, Math.round(sourceWidth * scale)));
  const resizedHeight = Math.min(targetHeight, Math.max(1, Math.round(sourceHeight * scale)));
  return {
    sourceWidth,
    sourceHeight,
    scale,
    resizedWidth,
    resizedHeight,
    padX: Math.max(0, Math.round((targetWidth - resizedWidth) / 2 - 0.1)),
    padY: Math.max(0, Math.round((targetHeight - resizedHeight) / 2 - 0.1)),
  };
}

/**
 * Pixels already resized to fit → target-size RGB pixels with `padValue`
 * borders, ready for `pixelsToTensor`.
 */
export function padPixels(
  pixels: RawPixels,
  targetWidth: number,
  targetHeight: number,
  padX: number,
  padY: number,
  padValue: number,
): RawPixels {
  const layout = pixelLayout(pixels.pixelFormat);
  if (!layout) throw new Error(`Unsupported pixel format: ${pixels.pixelFormat}`);
  const { width: w, height: h } = pixels;
  if (padX + w > targetWidth || padY + h > targetHeight) {
    throw new Error(`A ${w}x${h} image doesn't fit ${targetWidth}x${targetHeight} at ${padX},${padY}.`);
  }
  const rowBytes = pixels.buffer.byteLength / h;
  if (!Number.isInteger(rowBytes) || rowBytes < w * layout.bytesPerPixel) {
    throw new Error('Pixel buffer size does not match its width and height.');
  }
  const src = new Uint8Array(pixels.buffer);
  const out = new Uint8Array(targetWidth * targetHeight * 3).fill(padValue);
  for (let y = 0; y < h; y++) {
    const row = y * rowBytes;
    let o = ((y + padY) * targetWidth + padX) * 3;
    for (let x = 0; x < w; x++, o += 3) {
      const p = row + x * layout.bytesPerPixel;
      out[o] = src[p + layout.r];
      out[o + 1] = src[p + layout.g];
      out[o + 2] = src[p + layout.b];
    }
  }
  return { buffer: out.buffer, width: targetWidth, height: targetHeight, pixelFormat: 'RGB' };
}

/** The Nitro Image calls used to decode a saved frame. Injected so tests don't need native code. */
export interface DecodableImage {
  readonly width: number;
  readonly height: number;
  cropAsync(startX: number, startY: number, endX: number, endY: number): Promise<DecodableImage>;
  resizeAsync(width: number, height: number): Promise<DecodableImage>;
  toRawPixelDataAsync(): Promise<RawPixels>;
  dispose(): void;
}

export interface ImageDecoder {
  loadFromFileAsync(path: string): Promise<DecodableImage>;
}

/** Saved JPEG frame → input tensor. Every intermediate image is disposed. */
export async function imageFileToTensor(
  path: string,
  spec: TensorSpec,
  decoder: ImageDecoder,
): Promise<ArrayBuffer> {
  return (await imageFileToModelInput(path, spec, decoder)).tensor;
}

/**
 * Saved JPEG frame → input tensor, plus the letterbox geometry when `resize`
 * is `letterbox` (needed to map detector boxes back to the frame).
 */
export async function imageFileToModelInput(
  path: string,
  spec: TensorSpec,
  decoder: ImageDecoder,
): Promise<{ tensor: ArrayBuffer; letterbox: LetterboxInfo | null }> {
  const images: DecodableImage[] = [];
  try {
    let image = await decoder.loadFromFileAsync(path);
    images.push(image);
    if (spec.resize === 'letterbox') {
      const plan = letterboxPlan(image.width, image.height, spec.width, spec.height);
      if (image.width !== plan.resizedWidth || image.height !== plan.resizedHeight) {
        image = await image.resizeAsync(plan.resizedWidth, plan.resizedHeight);
        images.push(image);
      }
      const fitted = await image.toRawPixelDataAsync();
      const padded = padPixels(fitted, spec.width, spec.height, plan.padX, plan.padY, spec.padValue);
      const { sourceWidth, sourceHeight, scale, padX, padY } = plan;
      return {
        tensor: pixelsToTensor(padded, spec),
        letterbox: { sourceWidth, sourceHeight, scale, padX, padY },
      };
    }
    if (spec.resize === 'center_crop') {
      const r = centerCropRect(image.width, image.height, spec.width, spec.height);
      if (r.width !== image.width || r.height !== image.height) {
        image = await image.cropAsync(r.x, r.y, r.x + r.width, r.y + r.height);
        images.push(image);
      }
    }
    if (image.width !== spec.width || image.height !== spec.height) {
      image = await image.resizeAsync(spec.width, spec.height);
      images.push(image);
    }
    const pixels = await image.toRawPixelDataAsync();
    return { tensor: pixelsToTensor(pixels, spec), letterbox: null };
  } finally {
    for (const img of images) {
      try {
        img.dispose();
      } catch {
        // Already released.
      }
    }
  }
}

/** Output tensor bytes → real-valued scores (dequantized when needed). */
export function readScores(
  buffer: ArrayBuffer,
  dtype: TensorDType,
  quantization: Quantization | null,
): Float32Array {
  if (dtype === 'float32') {
    return new Float32Array(buffer.slice(0));
  }
  if (!quantization) {
    throw new Error(`A ${dtype} output needs quantization values in the manifest.`);
  }
  const raw = dtype === 'uint8' ? new Uint8Array(buffer) : new Int8Array(buffer);
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = (raw[i] - quantization.zeroPoint) * quantization.scale;
  }
  return out;
}

export function softmax(values: Float32Array): Float32Array {
  let max = -Infinity;
  for (const v of values) max = v > max ? v : max;
  const out = new Float32Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    out[i] = Math.exp(values[i] - max);
    sum += out[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

export function argmax(values: Float32Array): number {
  let best = -1;
  for (let i = 0; i < values.length; i++) {
    if (best < 0 || values[i] > values[best]) best = i;
  }
  return best;
}

export function meanVectors(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 0) throw new Error('No scores to average.');
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) {
    if (v.length !== out.length) throw new Error('Score vectors differ in length.');
    for (let i = 0; i < v.length; i++) out[i] += v[i] / vectors.length;
  }
  return out;
}

/** Scores for one classifier run, as probabilities in `labels` order. */
export function classifierProbabilities(
  output: ArrayBuffer,
  entry: ClassifierManifestEntry,
): Float32Array {
  const scores = readScores(output, entry.outputType, entry.outputQuantization);
  if (scores.length !== entry.labels.length) {
    throw new Error(`Model returned ${scores.length} scores for ${entry.labels.length} labels.`);
  }
  return entry.scores === 'logits' ? softmax(scores) : scores;
}

// ---------------------------------------------------------------- YOLO decoding

/** Intersection over union of two corner boxes. */
export function iou(a: Detection, b: Detection): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Greedy NMS per label (Ultralytics' default, not class-agnostic): highest
 * score first; a box is dropped if it overlaps a kept box of the same label
 * by more than `iouThreshold`.
 */
export function nonMaxSuppression(
  detections: Detection[],
  iouThreshold: number,
  maxDetections: number,
): Detection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    if (kept.length >= maxDetections) break;
    if (kept.every(k => k.labelIndex !== d.labelIndex || iou(k, d) <= iouThreshold)) kept.push(d);
  }
  return kept;
}

/**
 * Raw YOLOv8 head `[1, 4 + labels, anchors]` → boxes in model-input pixels.
 * Each anchor takes its best label; anchors below `confidenceThreshold` are
 * dropped, then NMS runs.
 */
export function decodeYoloDetections(
  output: ArrayBuffer,
  entry: YoloDetectorManifestEntry,
): Detection[] {
  const values = readScores(output, entry.outputType, entry.outputQuantization);
  const [, rows, anchors] = entry.outputShape;
  const labels = entry.labels.length;
  if (rows !== 4 + labels || values.length !== rows * anchors) {
    throw new Error(`Detector returned ${values.length} values; expected ${(4 + labels) * anchors}.`);
  }
  const [, , inH, inW] =
    entry.inputLayout === 'NCHW'
      ? entry.inputShape
      : [0, 0, entry.inputShape[1], entry.inputShape[2]];
  const sx = entry.boxFormat === 'cxcywh_normalised' ? inW : 1;
  const sy = entry.boxFormat === 'cxcywh_normalised' ? inH : 1;
  const at = (row: number, anchor: number) => values[row * anchors + anchor];

  const candidates: Detection[] = [];
  for (let j = 0; j < anchors; j++) {
    let best = 0;
    for (let c = 1; c < labels; c++) if (at(4 + c, j) > at(4 + best, j)) best = c;
    const score = at(4 + best, j);
    if (!(score >= entry.confidenceThreshold)) continue;
    const cx = at(0, j) * sx;
    const cy = at(1, j) * sy;
    const w = at(2, j) * sx;
    const h = at(3, j) * sy;
    if (!(w > 0 && h > 0)) continue;
    candidates.push({
      label: entry.labels[best],
      labelIndex: best,
      score,
      x1: cx - w / 2,
      y1: cy - h / 2,
      x2: cx + w / 2,
      y2: cy + h / 2,
    });
  }
  return nonMaxSuppression(candidates, entry.iouThreshold, entry.maxDetections);
}

/** Model-input box → source-frame pixels (undo letterbox), clipped to the frame. */
export function detectionToFrameRect(d: Detection, lb: LetterboxInfo): PixelRect | null {
  const clip = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  const x1 = clip((d.x1 - lb.padX) / lb.scale, lb.sourceWidth);
  const y1 = clip((d.y1 - lb.padY) / lb.scale, lb.sourceHeight);
  const x2 = clip((d.x2 - lb.padX) / lb.scale, lb.sourceWidth);
  const y2 = clip((d.y2 - lb.padY) / lb.scale, lb.sourceHeight);
  if (x2 - x1 <= 0 || y2 - y1 <= 0) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Box grown by `marginRatio` on each side → whole-pixel crop inside the frame. */
export function ocrCropRect(
  box: PixelRect,
  frameWidth: number,
  frameHeight: number,
  marginRatio: number,
): PixelRect {
  const mx = box.width * marginRatio;
  const my = box.height * marginRatio;
  const x1 = Math.max(0, Math.floor(box.x - mx));
  const y1 = Math.max(0, Math.floor(box.y - my));
  const x2 = Math.min(frameWidth, Math.ceil(box.x + box.width + mx));
  const y2 = Math.min(frameHeight, Math.ceil(box.y + box.height + my));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
