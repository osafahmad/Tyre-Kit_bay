import type { YoloSegDetectorManifestEntry } from '../../manifest';
import {
  decodeYoloSegOutput,
  detectionToFrameRect,
  inferBoxFormat,
  yoloAnchorCount,
  yoloSegOutputStats,
} from '../yoloSeg';
import { validateManifestEntry } from '../modelLoader';

// Synthetic YOLO seg tensors: a tiny 32 × 32 input gives 4² + 2² + 1² = 21
// anchors. Numbers here are made up for tests and must never be copied into
// src/ml/manifest.ts.
const ANCHORS = 21;
const entry: YoloSegDetectorManifestEntry = {
  file: 1,
  version: 'test',
  inputShape: [1, 3, 32, 32],
  inputLayout: 'NCHW',
  inputType: 'float32',
  colorOrder: 'RGB',
  resize: 'letterbox',
  letterboxPadValue: 114,
  normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
  inputQuantization: null,
  labels: ['Brand', 'DOT', 'Model', 'Size'],
  confidenceThreshold: 0.25,
  outputFormat: 'yolo_seg_raw',
  outputType: 'float32',
  outputQuantization: null,
  outputs: {
    detections: { name: 'det', shape: [1, 4 + 4 + 2, ANCHORS] },
    prototypes: { name: 'proto', shape: [1, 2, 8, 8] },
  },
  maskCoefficients: 2,
  boxFormat: 'cxcywh_normalised',
  iouThreshold: 0.45,
  maxDetections: 300,
};

type Anchor = { box: [number, number, number, number]; scores: number[]; mask?: [number, number] };

/** Attribute-major `[1, 10, 21]` buffer with the given anchors filled in; the rest stay 0. */
function output(anchors: Record<number, Anchor>): ArrayBuffer {
  const attributes = 4 + 4 + 2;
  const v = new Float32Array(attributes * ANCHORS);
  for (const [j, a] of Object.entries(anchors)) {
    const anchor = Number(j);
    a.box.forEach((b, i) => (v[i * ANCHORS + anchor] = b));
    a.scores.forEach((s, c) => (v[(4 + c) * ANCHORS + anchor] = s));
    (a.mask ?? [0, 0]).forEach((m, k) => (v[(8 + k) * ANCHORS + anchor] = m));
  }
  return v.buffer;
}

test('anchor count: 640 × 640 gives 8400 (80² + 40² + 20²); 32 × 32 gives 21', () => {
  expect(yoloAnchorCount(640, 640)).toBe(8400);
  expect(yoloAnchorCount(32, 32)).toBe(ANCHORS);
  expect(validateManifestEntry('sidewallText', entry)).toEqual([]);
});

describe('decodeYoloSegOutput', () => {
  test('normalised cx, cy, w, h → corners in input pixels, best label, scores as output (no second sigmoid)', () => {
    const out = output({
      3: { box: [0.5, 0.5, 0.5, 0.25], scores: [0.1, 0.9, 0.2, 0.0], mask: [0.3, -0.7] },
    });
    const [d] = decodeYoloSegOutput(out, entry);
    expect(d).toMatchObject({ label: 'DOT', labelIndex: 1, score: expect.closeTo(0.9, 5) });
    expect([d.x1, d.y1, d.x2, d.y2]).toEqual([8, 12, 24, 20]);
    expect(Array.from(d.maskCoefficients).map(n => Math.round(n * 10) / 10)).toEqual([0.3, -0.7]);
  });

  test('pixel boxes are used as they are when the manifest or an override says so', () => {
    const out = output({ 0: { box: [16, 16, 16, 8], scores: [0.8, 0, 0, 0] } });
    const [d] = decodeYoloSegOutput(out, { ...entry, boxFormat: 'cxcywh_pixels' });
    expect([d.x1, d.y1, d.x2, d.y2]).toEqual([8, 12, 24, 20]);
    const [o] = decodeYoloSegOutput(out, entry, { boxFormat: 'cxcywh_pixels' });
    expect([o.x1, o.y1, o.x2, o.y2]).toEqual([8, 12, 24, 20]);
  });

  test('anchors below the threshold, and zero-size boxes, are dropped; boxes are clamped to the input', () => {
    const out = output({
      0: { box: [0.5, 0.5, 0.5, 0.5], scores: [0.24, 0, 0, 0] }, // below 0.25
      1: { box: [0.5, 0.5, 0, 0.5], scores: [0.9, 0, 0, 0] }, // no width
      2: { box: [0.95, 0.5, 0.5, 0.5], scores: [0, 0, 0, 0.6] }, // overhangs the right edge
    });
    const dets = decodeYoloSegOutput(out, entry);
    expect(dets).toHaveLength(1);
    expect(dets[0]).toMatchObject({ label: 'Size', x1: expect.closeTo(22.4, 3), x2: 32 });
    expect(decodeYoloSegOutput(out, entry, { confidenceThreshold: 0.2 })).toHaveLength(2);
  });

  test('NMS is per label: overlapping boxes of different labels both stay, same label keeps the best', () => {
    const same = [0.5, 0.5, 0.5, 0.5] as [number, number, number, number];
    const out = output({
      0: { box: same, scores: [0.7, 0, 0, 0] },
      1: { box: same, scores: [0.9, 0, 0, 0] },
      2: { box: same, scores: [0, 0, 0.6, 0] },
    });
    const dets = decodeYoloSegOutput(out, entry);
    expect(dets.map(d => [d.label, Math.round(d.score * 10) / 10])).toEqual([
      ['Brand', 0.9],
      ['Model', 0.6],
    ]);
    expect(decodeYoloSegOutput(out, entry, { maxDetections: 1 })).toHaveLength(1);
  });

  test('a buffer of the wrong size is refused', () => {
    expect(() => decodeYoloSegOutput(new Float32Array(10).buffer, entry)).toThrow(/expected 210/);
  });
});

describe('yoloSegOutputStats and inferBoxFormat', () => {
  test('ranges per row group, best score per class, anchors above the threshold', () => {
    const out = output({
      0: { box: [0.5, 0.5, 0.5, 0.25], scores: [0.1, 0.9, 0.2, 0.0], mask: [0.3, -0.7] },
      1: { box: [0.2, 0.9, 0.1, 0.1], scores: [0.3, 0.0, 0.0, 0.26], mask: [1.5, 0] },
    });
    const protos = new Float32Array([-2, 0, 3.25, 1]).buffer;
    const stats = yoloSegOutputStats(out, protos, entry);
    expect(stats).toEqual({
      anchors: ANCHORS,
      boxes: { min: 0, max: 0.9 },
      classMax: { Brand: 0.3, DOT: 0.9, Model: 0.2, Size: 0.26 },
      maskCoefficients: { min: -0.7, max: 1.5 },
      prototypes: { min: -2, max: 3.25 },
      anchorsAboveThreshold: 2,
    });
    expect(yoloSegOutputStats(out, null, entry, 0.5).prototypes).toBeNull();
    expect(yoloSegOutputStats(out, null, entry, 0.5).anchorsAboveThreshold).toBe(1);
  });

  test('box format from the raw range: ≤ 1.5 normalised, above it pixels, all-zero undecided', () => {
    expect(inferBoxFormat({ boxes: { min: 0, max: 0.98 } })).toBe('cxcywh_normalised');
    expect(inferBoxFormat({ boxes: { min: 0, max: 1.2 } })).toBe('cxcywh_normalised');
    expect(inferBoxFormat({ boxes: { min: 0, max: 412 } })).toBe('cxcywh_pixels');
    expect(inferBoxFormat({ boxes: { min: 0, max: 0 } })).toBeNull();
  });
});

describe('detectionToFrameRect', () => {
  // A 64 × 32 frame letterboxed into 32 × 32: scale 0.5, 8 px of padding top and bottom.
  const letterbox = { sourceWidth: 64, sourceHeight: 32, scale: 0.5, padX: 0, padY: 8 };
  const det = (x1: number, y1: number, x2: number, y2: number) => ({
    label: 'Size',
    labelIndex: 3,
    score: 1,
    x1,
    y1,
    x2,
    y2,
  });

  test('undoes the scale and padding and clips to the frame', () => {
    expect(detectionToFrameRect(det(8, 12, 24, 20), letterbox)).toEqual({ x: 16, y: 8, width: 32, height: 16 });
    // Overhanging the top padding: clipped to the frame's top edge.
    expect(detectionToFrameRect(det(0, 4, 32, 28), letterbox)).toEqual({ x: 0, y: 0, width: 64, height: 32 });
  });

  test('a box entirely inside the padding gives null', () => {
    expect(detectionToFrameRect(det(0, 0, 32, 6), letterbox)).toBeNull();
  });
});

describe('manifest validation for yolo_seg_raw', () => {
  test('catches the wrong attribute count, anchor count, prototype channels and resize', () => {
    const detections = { name: 'det', shape: [1, 9, ANCHORS] };
    expect(validateManifestEntry('sidewallText', { ...entry, outputs: { ...entry.outputs, detections } })).toContain(
      'outputs.detections needs 10 values per anchor (4 box + 4 labels + 2 mask coefficients), has 9',
    );
    const anchors = { name: 'det', shape: [1, 10, 20] };
    expect(validateManifestEntry('sidewallText', { ...entry, outputs: { ...entry.outputs, detections: anchors } })).toContain(
      'a 32 × 32 input makes 21 anchors, outputs have 20',
    );
    const prototypes = { name: 'proto', shape: [1, 3, 8, 8] };
    expect(validateManifestEntry('sidewallText', { ...entry, outputs: { ...entry.outputs, prototypes } })).toContain(
      'outputs.prototypes needs 2 channels, has 3',
    );
    expect(validateManifestEntry('sidewallText', { ...entry, resize: 'stretch' })).toContain(
      'YOLO detectors are trained on letterboxed input; resize must be letterbox',
    );
    expect(validateManifestEntry('sidewallText', { ...entry, iouThreshold: 0 })).toContain(
      'iouThreshold must be above 0 and at most 1',
    );
  });
});
