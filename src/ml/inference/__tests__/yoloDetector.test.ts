import {
  decodeYoloDetections,
  detectionToFrameRect,
  imageFileToModelInput,
  iou,
  letterboxPlan,
  nonMaxSuppression,
  ocrCropRect,
  padPixels,
  tensorSpecFromManifest,
} from '../tensorUtils';
import { validateManifestEntry } from '../modelLoader';
import type { Detection } from '../types';
import { modelManifest, type YoloDetectorManifestEntry } from '../../manifest';
import { fakeDecoder } from '../__fixtures__/models';

const entry = modelManifest.sidewallTextDetector!;
const ANCHORS = entry.outputShape[2];

/** Raw `[1, 8, anchors]` output with the given anchors filled in (normalised cx, cy, w, h). */
function rawOutput(
  anchors: { j: number; box: [number, number, number, number]; scores: number[] }[],
  e: YoloDetectorManifestEntry = entry,
): ArrayBuffer {
  const n = e.outputShape[2];
  const out = new Float32Array(e.outputShape[1] * n);
  for (const { j, box, scores } of anchors) {
    box.forEach((v, r) => (out[r * n + j] = v));
    scores.forEach((v, c) => (out[(4 + c) * n + j] = v));
  }
  return out.buffer;
}

const det = (labelIndex: number, score: number, x1: number, y1: number, x2: number, y2: number): Detection => ({
  label: entry.labels[labelIndex],
  labelIndex,
  score,
  x1,
  y1,
  x2,
  y2,
});

describe('letterbox preprocessing', () => {
  test('landscape frame: fit to width, pad top and bottom (Ultralytics rounding)', () => {
    expect(letterboxPlan(1920, 1080, 224, 224)).toEqual({
      sourceWidth: 1920,
      sourceHeight: 1080,
      scale: 224 / 1920,
      resizedWidth: 224,
      resizedHeight: 126,
      padX: 0,
      padY: 49,
    });
  });

  test('portrait frame: fit to height, pad left and right', () => {
    const p = letterboxPlan(600, 800, 224, 224);
    expect([p.resizedWidth, p.resizedHeight, p.padX, p.padY]).toEqual([168, 224, 28, 0]);
  });

  test('square frame needs no padding', () => {
    const p = letterboxPlan(1000, 1000, 224, 224);
    expect([p.resizedWidth, p.resizedHeight, p.padX, p.padY]).toEqual([224, 224, 0, 0]);
  });

  test('padPixels centres the image on the pad grey, as RGB', () => {
    const red = { buffer: new Uint8Array([255, 0, 0, 255]).buffer, width: 1, height: 1, pixelFormat: 'RGBA' };
    const out = padPixels(red, 3, 1, 1, 0, 114);
    expect(out.pixelFormat).toBe('RGB');
    expect(Array.from(new Uint8Array(out.buffer))).toEqual([114, 114, 114, 255, 0, 0, 114, 114, 114]);
    expect(() => padPixels(red, 1, 1, 1, 0, 114)).toThrow(/doesn't fit/);
  });

  test('frame → padded 0–1 float32 NCHW tensor plus letterbox geometry; images disposed', async () => {
    const { decoder, created } = fakeDecoder({ width: 448, height: 224 }, 255);
    const spec = tensorSpecFromManifest(entry);
    const { tensor, letterbox } = await imageFileToModelInput('/f.jpg', spec, decoder);

    expect(created[0].resizeAsync).toHaveBeenCalledWith(224, 112);
    expect(letterbox).toEqual({ sourceWidth: 448, sourceHeight: 224, scale: 0.5, padX: 0, padY: 56 });
    const t = new Float32Array(tensor);
    expect(t.length).toBe(3 * 224 * 224);
    const plane = 224 * 224;
    const px = (c: number, x: number, y: number) => t[c * plane + y * 224 + x];
    for (let c = 0; c < 3; c++) {
      expect(px(c, 10, 0)).toBeCloseTo(114 / 255); // padding row
      expect(px(c, 10, 55)).toBeCloseTo(114 / 255);
      expect(px(c, 10, 56)).toBe(1); // image starts
      expect(px(c, 10, 167)).toBe(1);
      expect(px(c, 10, 168)).toBeCloseTo(114 / 255);
    }
    expect(created.every(img => img.dispose.mock.calls.length === 1)).toBe(true);
  });

  test('the manifest requires a pad value for letterbox', () => {
    expect(validateManifestEntry('sidewallTextDetector', { ...entry, letterboxPadValue: undefined })).toContain(
      'letterboxPadValue must be an integer 0–255 for letterbox resize',
    );
  });
});

describe('YOLOv8 decoding', () => {
  test('reads [1, 8, anchors] attribute-major, picks the best label, scales to input pixels', () => {
    const out = rawOutput([
      { j: 5, box: [0.5, 0.25, 0.2, 0.1], scores: [0.1, 0.9, 0.2, 0] },
      { j: 700, box: [0.1, 0.1, 0.05, 0.05], scores: [0, 0, 0, 0.6] },
    ]);
    const d = decodeYoloDetections(out, entry);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ label: 'Dot-Code', labelIndex: 1 });
    expect(d[0].score).toBeCloseTo(0.9);
    expect(d[0].x1).toBeCloseTo(0.4 * 224);
    expect(d[0].y1).toBeCloseTo(0.2 * 224);
    expect(d[0].x2).toBeCloseTo(0.6 * 224);
    expect(d[0].y2).toBeCloseTo(0.3 * 224);
    expect(d[1].label).toBe('Size');
  });

  test('drops anchors below the confidence threshold and empty boxes', () => {
    const out = rawOutput([
      { j: 1, box: [0.5, 0.5, 0.2, 0.2], scores: [0.24, 0, 0, 0] },
      { j: 2, box: [0.5, 0.5, 0, 0.2], scores: [0.9, 0, 0, 0] },
      { j: 3, box: [0.5, 0.5, 0.2, 0.2], scores: [0.25, 0, 0, 0] },
    ]);
    expect(decodeYoloDetections(out, entry).map(d => d.score)).toEqual([0.25]);
  });

  test('pixel box format is not rescaled', () => {
    const px = { ...entry, boxFormat: 'cxcywh_pixels' as const };
    const [d] = decodeYoloDetections(rawOutput([{ j: 0, box: [100, 50, 20, 10], scores: [1, 0, 0, 0] }], px), px);
    expect([d.x1, d.y1, d.x2, d.y2]).toEqual([90, 45, 110, 55]);
  });

  test('NMS removes same-label overlaps above IoU 0.45, keeps other labels', () => {
    const out = rawOutput([
      { j: 10, box: [0.5, 0.5, 0.2, 0.2], scores: [0.9, 0, 0, 0] },
      { j: 11, box: [0.51, 0.5, 0.2, 0.2], scores: [0.8, 0, 0, 0] }, // Brand, IoU ≈ 0.90 → dropped
      { j: 12, box: [0.5, 0.5, 0.2, 0.2], scores: [0, 0, 0.7, 0] }, // Model, same place → kept
      { j: 13, box: [0.9, 0.9, 0.1, 0.1], scores: [0.6, 0, 0, 0] }, // Brand, elsewhere → kept
    ]);
    expect(decodeYoloDetections(out, entry).map(d => [d.label, d.score.toFixed(1)])).toEqual([
      ['Brand', '0.9'],
      ['Model', '0.7'],
      ['Brand', '0.6'],
    ]);
  });

  test('NMS boundary: IoU equal to the threshold is kept, above it is dropped', () => {
    const a = det(0, 0.9, 0, 0, 10, 10);
    expect(iou(a, det(0, 0.5, 0, 0, 10, 10))).toBe(1);
    expect(iou(a, det(0, 0.5, 20, 20, 30, 30))).toBe(0);
    // b overlaps a by 10x5 = 50, union 100 + 100 - 50 → IoU 1/3.
    const b = det(0, 0.8, 0, 5, 10, 15);
    expect(iou(a, b)).toBeCloseTo(1 / 3);
    expect(nonMaxSuppression([a, b], 1 / 3, 300)).toHaveLength(2);
    expect(nonMaxSuppression([a, b], 0.3, 300)).toHaveLength(1);
  });

  test('maxDetections caps the result, best first', () => {
    const many = Array.from({ length: 5 }, (_, i) => det(0, 0.5 + i / 10, i * 20, 0, i * 20 + 10, 10));
    expect(nonMaxSuppression(many, 0.45, 2).map(d => d.score)).toEqual([0.9, 0.8]);
  });

  test('rejects an output of the wrong size', () => {
    expect(() => decodeYoloDetections(new Float32Array(10).buffer, entry)).toThrow(/expected 8232/);
    expect(ANCHORS * 8).toBe(8232);
  });
});

describe('boxes back to frame pixels for OCR', () => {
  const lb = { sourceWidth: 448, sourceHeight: 224, scale: 0.5, padX: 0, padY: 56 };

  test('undoes the letterbox and clips to the frame', () => {
    expect(detectionToFrameRect(det(0, 1, 10, 66, 30, 76), lb)).toEqual({ x: 20, y: 20, width: 40, height: 20 });
    expect(detectionToFrameRect(det(0, 1, -10, 40, 30, 76), lb)).toEqual({ x: 0, y: 0, width: 60, height: 40 });
    // Entirely in the padding: nothing to crop.
    expect(detectionToFrameRect(det(0, 1, 10, 0, 30, 50), lb)).toBeNull();
  });

  test('crop rect adds the margin in whole pixels inside the frame', () => {
    expect(ocrCropRect({ x: 20, y: 20, width: 40, height: 20 }, 448, 224, 0.1)).toEqual({
      x: 16,
      y: 18,
      width: 48,
      height: 24,
    });
    expect(ocrCropRect({ x: 0, y: 210, width: 448, height: 14 }, 448, 224, 0.5)).toEqual({
      x: 0,
      y: 203,
      width: 448,
      height: 21,
    });
  });
});
