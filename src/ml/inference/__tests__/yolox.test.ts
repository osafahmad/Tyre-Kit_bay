import type { YoloxDetectorManifestEntry } from '../../manifest';
import { decodeYoloxOutput, detectionToFrameRect, inferBoxFormat, yoloxAnchorCount, yoloxOutputStats } from '../yolox';
import { checkModelMatchesManifest, validateManifestEntry } from '../modelLoader';
import type { InferenceModel } from '../types';

// Synthetic YOLOX tensors: a tiny 32 × 32 input gives 4² + 2² + 1² = 21
// anchors, each with 4 box values and 4 class scores (`[1, 8, 21]`, the same
// layout as the bundled `[1, 8, 8400]`). Numbers here are made up for tests
// and must never be copied into src/ml/manifest.ts.
const ANCHORS = 21;
const ATTRS = 8;
const entry: YoloxDetectorManifestEntry = {
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
  outputFormat: 'yolox_decoded',
  outputType: 'float32',
  outputQuantization: null,
  outputs: { detections: { name: 'det', shape: [1, ATTRS, ANCHORS] } },
  boxFormat: 'cxcywh_pixels',
  iouThreshold: 0.45,
  maxDetections: 300,
};

type Anchor = { box: [number, number, number, number]; scores: number[] };

/** Attribute-major `[1, 8, 21]` buffer with the given anchors filled in; the rest stay 0. */
function output(anchors: Record<number, Anchor>): ArrayBuffer {
  const v = new Float32Array(ATTRS * ANCHORS);
  for (const [j, a] of Object.entries(anchors)) {
    const anchor = Number(j);
    a.box.forEach((b, i) => (v[i * ANCHORS + anchor] = b));
    a.scores.forEach((s, c) => (v[(4 + c) * ANCHORS + anchor] = s));
  }
  return v.buffer;
}

test('anchor count: 640 × 640 gives 8400 (80² + 40² + 20²); 32 × 32 gives 21', () => {
  expect(yoloxAnchorCount(640, 640)).toBe(8400);
  expect(yoloxAnchorCount(32, 32)).toBe(ANCHORS);
  expect(validateManifestEntry('sidewallText', entry)).toEqual([]);
});

describe('decodeYoloxOutput', () => {
  test('pixel cx, cy, w, h → corners in input pixels, best label, scores as output; nothing but the box is returned', () => {
    const out = output({ 3: { box: [16, 16, 16, 8], scores: [0.1, 0.9, 0.2, 0.0] } });
    const [d] = decodeYoloxOutput(out, entry);
    expect(d).toEqual({ label: 'DOT', labelIndex: 1, score: expect.closeTo(0.9, 5), x1: 8, y1: 12, x2: 24, y2: 20 });
  });

  test('boxes are not grid-decoded again: the same values give the same box at every anchor', () => {
    // The export applies the grid offsets and strides itself. A second decode
    // here would shift a box by its anchor's cell, so anchors 0 (stride 8),
    // 16 (stride 16) and 20 (stride 32) would disagree.
    for (const anchor of [0, 5, 16, 20]) {
      const [d] = decodeYoloxOutput(output({ [anchor]: { box: [10, 20, 8, 6], scores: [0, 0, 0, 0.7] } }), entry);
      expect([d.x1, d.y1, d.x2, d.y2]).toEqual([6, 17, 14, 23]);
    }
  });

  test('0–1 boxes are scaled to the input when the manifest or an override says so', () => {
    const out = output({ 0: { box: [0.5, 0.5, 0.5, 0.25], scores: [0.8, 0, 0, 0] } });
    const [d] = decodeYoloxOutput(out, { ...entry, boxFormat: 'cxcywh_normalised' });
    expect([d.x1, d.y1, d.x2, d.y2]).toEqual([8, 12, 24, 20]);
    const [o] = decodeYoloxOutput(out, entry, { boxFormat: 'cxcywh_normalised' });
    expect([o.x1, o.y1, o.x2, o.y2]).toEqual([8, 12, 24, 20]);
  });

  test('anchors below the threshold, and zero-size boxes, are dropped; boxes are clamped to the input', () => {
    const out = output({
      0: { box: [16, 16, 16, 16], scores: [0.24, 0, 0, 0] }, // below 0.25
      1: { box: [16, 16, 0, 16], scores: [0.9, 0, 0, 0] }, // no width
      2: { box: [30, 16, 16, 16], scores: [0, 0, 0, 0.6] }, // overhangs the right edge
    });
    const dets = decodeYoloxOutput(out, entry);
    expect(dets).toHaveLength(1);
    expect(dets[0]).toMatchObject({ label: 'Size', x1: 22, x2: 32 });
    expect(decodeYoloxOutput(out, entry, { confidenceThreshold: 0.2 })).toHaveLength(2);
  });

  test('the threshold is inclusive: a score of exactly 0.25 is kept', () => {
    const out = output({ 0: { box: [16, 16, 8, 8], scores: [0.25, 0, 0, 0] } });
    expect(decodeYoloxOutput(out, entry)).toHaveLength(1);
  });

  test('NMS is per label: overlapping boxes of different labels both stay, same label keeps the best', () => {
    const same = [16, 16, 16, 16] as [number, number, number, number];
    const out = output({
      0: { box: same, scores: [0.7, 0, 0, 0] },
      1: { box: same, scores: [0.9, 0, 0, 0] },
      2: { box: same, scores: [0, 0, 0.6, 0] },
    });
    const dets = decodeYoloxOutput(out, entry);
    expect(dets.map(d => [d.label, Math.round(d.score * 10) / 10])).toEqual([
      ['Brand', 0.9],
      ['Model', 0.6],
    ]);
    expect(decodeYoloxOutput(out, entry, { maxDetections: 1 })).toHaveLength(1);
  });

  test('NMS at IoU 0.45: same-label boxes overlapping more than that merge, less than that both stay', () => {
    // 16 × 16 boxes. Shifted 4 px: IoU 192 / 320 = 0.6. Shifted 8 px: IoU 128 / 384 = 0.33.
    const near = output({
      0: { box: [12, 16, 16, 16], scores: [0, 0.9, 0, 0] },
      1: { box: [16, 16, 16, 16], scores: [0, 0.8, 0, 0] },
    });
    expect(decodeYoloxOutput(near, entry).map(d => Math.round(d.score * 10) / 10)).toEqual([0.9]);
    const apart = output({
      0: { box: [12, 16, 16, 16], scores: [0, 0.9, 0, 0] },
      1: { box: [20, 16, 16, 16], scores: [0, 0.8, 0, 0] },
    });
    expect(decodeYoloxOutput(apart, entry)).toHaveLength(2);
  });

  test('a buffer of the wrong size is refused, including the old seg layout', () => {
    expect(() => decodeYoloxOutput(new Float32Array(10).buffer, entry)).toThrow(/expected 168/);
    // 4 box + 4 class + 32 mask coefficients per anchor, as the removed model returned.
    expect(() => decodeYoloxOutput(new Float32Array(40 * ANCHORS).buffer, entry)).toThrow(/expected 168/);
  });
});

describe('yoloxOutputStats and inferBoxFormat', () => {
  test('box range, best score per class, anchors above the threshold', () => {
    const out = output({
      0: { box: [16, 16, 16, 8], scores: [0.1, 0.9, 0.2, 0.0] },
      1: { box: [6, 28.5, 3, 3], scores: [0.3, 0.0, 0.0, 0.26] },
    });
    expect(yoloxOutputStats(out, entry)).toEqual({
      anchors: ANCHORS,
      boxes: { min: 0, max: 28.5 },
      classMax: { Brand: 0.3, DOT: 0.9, Model: 0.2, Size: 0.26 },
      anchorsAboveThreshold: 2,
    });
    expect(yoloxOutputStats(out, entry, 0.5).anchorsAboveThreshold).toBe(1);
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

describe('manifest validation for yolox_decoded', () => {
  test('catches the wrong attribute count, anchor count, format and resize', () => {
    const detections = { name: 'det', shape: [1, 9, ANCHORS] };
    expect(validateManifestEntry('sidewallText', { ...entry, outputs: { detections } })).toContain(
      'outputs.detections needs 8 values per anchor (4 box + 4 labels), has 9',
    );
    const anchors = { name: 'det', shape: [1, ATTRS, 20] };
    expect(validateManifestEntry('sidewallText', { ...entry, outputs: { detections: anchors } })).toContain(
      'a 32 × 32 input makes 21 anchors, outputs have 20',
    );
    expect(validateManifestEntry('sidewallText', { ...entry, resize: 'stretch' })).toContain(
      'YOLOX detectors are trained on letterboxed input; resize must be letterbox',
    );
    expect(validateManifestEntry('sidewallText', { ...entry, iouThreshold: 0 })).toContain(
      'iouThreshold must be above 0 and at most 1',
    );
    const old = { ...entry, outputFormat: 'yolo_seg_raw' } as unknown as YoloxDetectorManifestEntry;
    expect(validateManifestEntry('sidewallText', old)).toContain('outputFormat yolo_seg_raw is not supported');
  });

  test('a model with a second output tensor (a seg export) does not match the entry', () => {
    const det = { name: 'det', dataType: 'float32' as const, shape: [1, ATTRS, ANCHORS] };
    const model = (outputs: InferenceModel['outputs']): InferenceModel => ({
      inputs: [{ name: 'in', dataType: 'float32', shape: [1, 3, 32, 32] }],
      outputs,
      run: jest.fn(),
    });
    expect(checkModelMatchesManifest('sidewallText', model([det]), entry)).toEqual([]);
    const proto = { name: 'proto', dataType: 'float32' as const, shape: [1, 32, 8, 8] };
    expect(checkModelMatchesManifest('sidewallText', model([det, proto]), entry)).toContain(
      'expected 1 output tensor, model has 2',
    );
    const seg = { ...det, shape: [1, 40, ANCHORS] };
    expect(checkModelMatchesManifest('sidewallText', model([seg]), entry)).toContain(
      'output 0 shape is [1,40,21], manifest says [1,8,21]',
    );
  });
});
