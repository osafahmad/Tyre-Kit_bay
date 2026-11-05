import type { ClassifierManifestEntry, ModelManifest, Quantization, TensorDType } from '../manifest';
import type { RawPixels, TensorSpec } from './types';

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
  const images: DecodableImage[] = [];
  try {
    let image = await decoder.loadFromFileAsync(path);
    images.push(image);
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
    return pixelsToTensor(pixels, spec);
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
