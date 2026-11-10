import {
  imageFileToModelInput,
  iou,
  letterboxPlan,
  nonMaxSuppression,
  padPixels,
  tensorSpecFromManifest,
} from '../tensorUtils';
import { validateManifestEntry } from '../modelLoader';
import type { Detection } from '../types';
import type { DetectorManifestEntry } from '../../manifest';
import { fakeDecoder } from '../__fixtures__/models';

// Generic letterbox preprocessing and NMS. No bundled model uses letterbox
// today (the YOLOv8 sidewall text detector was removed, DECISIONS.md
// 2026-11-10); a synthetic NCHW 224 × 224 entry exercises it.
const entry: DetectorManifestEntry = {
  file: 1,
  version: 'test',
  inputShape: [1, 3, 224, 224],
  inputLayout: 'NCHW',
  inputType: 'float32',
  colorOrder: 'RGB',
  resize: 'letterbox',
  letterboxPadValue: 114,
  normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
  inputQuantization: null,
  labels: ['a', 'b'],
  confidenceThreshold: 0.5,
  outputFormat: 'test',
};

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
  test('landscape frame: fit to width, pad top and bottom (round(d ± 0.1) split)', () => {
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
    expect(validateManifestEntry('tyreDetector', { ...entry, letterboxPadValue: undefined })).toContain(
      'letterboxPadValue must be an integer 0–255 for letterbox resize',
    );
  });
});

describe('non-max suppression', () => {
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

});
