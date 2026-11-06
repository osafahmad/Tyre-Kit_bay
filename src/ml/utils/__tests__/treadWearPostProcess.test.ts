import { TREAD_WEAR_CLASSES } from '../../config/treadWearConfig';
import { modelManifest } from '../../manifest';
import { normaliseBox, parseTreadWearOutput } from '../treadWearPostProcess';

// Synthetic [1, 18, 1029] tensors in the model's layout: attribute-major,
// row r of anchor j at r * 1029 + j. Rows 0–3 are cx, cy, w, h (0–1), rows
// 4–17 the 14 class scores.

const entry = modelManifest.treadWear!;
const ROWS = 18;
const ANCHORS = 1029;

type Anchor = { anchor: number; box: [number, number, number, number]; scores: Record<number, number> };

function tensor(anchors: Anchor[]): Float32Array {
  const t = new Float32Array(ROWS * ANCHORS);
  for (const a of anchors) {
    a.box.forEach((v, r) => (t[r * ANCHORS + a.anchor] = v));
    for (const [cls, s] of Object.entries(a.scores)) t[(4 + Number(cls)) * ANCHORS + a.anchor] = s;
  }
  return t;
}

const CENTER = TREAD_WEAR_CLASSES.indexOf('Center Wear');
const FEATHER = TREAD_WEAR_CLASSES.indexOf('Feather Edge');

describe('parseTreadWearOutput', () => {
  test('decodes a [1, 18, 1029] tensor into typed, normalised [x, y, w, h] boxes', () => {
    const out = parseTreadWearOutput(
      tensor([
        { anchor: 10, box: [0.5, 0.5, 0.2, 0.4], scores: { [CENTER]: 0.9, [FEATHER]: 0.3 } },
        { anchor: 1000, box: [0.25, 0.75, 0.1, 0.1], scores: { [FEATHER]: 0.55 } },
      ]),
      entry,
    );
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('Center Wear');
    expect(out[0].confidence).toBeCloseTo(0.9);
    expect(out[0].bbox[0]).toBeCloseTo(0.4);
    expect(out[0].bbox[1]).toBeCloseTo(0.3);
    expect(out[0].bbox[2]).toBeCloseTo(0.2);
    expect(out[0].bbox[3]).toBeCloseTo(0.4);
    expect(out[1].label).toBe('Feather Edge');
    expect(out[1].bbox.map(v => Number(v.toFixed(4)))).toEqual([0.2, 0.7, 0.1, 0.1]);
  });

  test('each anchor takes only its best class', () => {
    const out = parseTreadWearOutput(
      tensor([{ anchor: 5, box: [0.5, 0.5, 0.2, 0.2], scores: { 0: 0.4, 13: 0.7 } }]),
      entry,
    );
    expect(out.map(d => d.label)).toEqual(['Wavy Wear']);
  });

  test('accepts raw bytes, a Float32Array view and nested arrays alike', () => {
    const flat = tensor([{ anchor: 7, box: [0.5, 0.5, 0.2, 0.2], scores: { [CENTER]: 0.8 } }]);
    const padded = new Float32Array(flat.length + 4);
    padded.set(flat, 4);
    const view = padded.subarray(4);
    const nested = [Array.from({ length: ROWS }, (_, r) => Array.from(flat.subarray(r * ANCHORS, (r + 1) * ANCHORS)))];
    const expected = parseTreadWearOutput(flat.slice().buffer, entry);
    expect(expected).toHaveLength(1);
    expect(parseTreadWearOutput(view, entry)).toEqual(expected);
    expect(parseTreadWearOutput(nested, entry)).toEqual(expected);
  });

  describe('NMS', () => {
    test('drops a same-class box overlapping a stronger one above IoU 0.45', () => {
      const out = parseTreadWearOutput(
        tensor([
          { anchor: 1, box: [0.5, 0.5, 0.4, 0.4], scores: { [CENTER]: 0.9 } },
          { anchor: 2, box: [0.52, 0.5, 0.4, 0.4], scores: { [CENTER]: 0.8 } }, // IoU ≈ 0.9
        ]),
        entry,
      );
      expect(out).toHaveLength(1);
      expect(out[0].confidence).toBeCloseTo(0.9);
    });

    test('keeps overlapping boxes of different classes (per-class NMS)', () => {
      const out = parseTreadWearOutput(
        tensor([
          { anchor: 1, box: [0.5, 0.5, 0.4, 0.4], scores: { [CENTER]: 0.9 } },
          { anchor: 2, box: [0.5, 0.5, 0.4, 0.4], scores: { [FEATHER]: 0.8 } },
        ]),
        entry,
      );
      expect(out.map(d => d.label)).toEqual(['Center Wear', 'Feather Edge']);
    });

    test('keeps same-class boxes that barely overlap', () => {
      const out = parseTreadWearOutput(
        tensor([
          { anchor: 1, box: [0.25, 0.5, 0.3, 0.3], scores: { [CENTER]: 0.9 } },
          { anchor: 2, box: [0.7, 0.5, 0.3, 0.3], scores: { [CENTER]: 0.6 } },
        ]),
        entry,
      );
      expect(out).toHaveLength(2);
    });

    test('the IoU threshold can be overridden for calibration', () => {
      const anchors: Anchor[] = [
        { anchor: 1, box: [0.5, 0.5, 0.4, 0.4], scores: { [CENTER]: 0.9 } },
        { anchor: 2, box: [0.6, 0.5, 0.4, 0.4], scores: { [CENTER]: 0.8 } }, // IoU 0.6
      ];
      expect(parseTreadWearOutput(tensor(anchors), entry)).toHaveLength(1);
      expect(parseTreadWearOutput(tensor(anchors), entry, { iouThreshold: 0.7 })).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    test('an all-zero output gives no detections', () => {
      expect(parseTreadWearOutput(new Float32Array(ROWS * ANCHORS), entry)).toEqual([]);
    });

    test('scores below the 0.25 confidence threshold are dropped', () => {
      const t = tensor([
        { anchor: 3, box: [0.5, 0.5, 0.2, 0.2], scores: { [CENTER]: 0.249 } },
        { anchor: 4, box: [0.3, 0.3, 0.2, 0.2], scores: { [FEATHER]: 0.25 } },
      ]);
      expect(parseTreadWearOutput(t, entry).map(d => d.label)).toEqual(['Feather Edge']);
      expect(parseTreadWearOutput(t, entry, { confidenceThreshold: 0.5 })).toEqual([]);
    });

    test('NaN scores and zero-size boxes are dropped', () => {
      const t = tensor([
        { anchor: 3, box: [0.5, 0.5, 0.2, 0.2], scores: { [CENTER]: NaN } },
        { anchor: 4, box: [0.5, 0.5, 0, 0.2], scores: { [CENTER]: 0.9 } },
      ]);
      expect(parseTreadWearOutput(t, entry)).toEqual([]);
    });

    test('boxes crossing the input edges are clamped to [0, 1]', () => {
      const out = parseTreadWearOutput(
        tensor([
          { anchor: 0, box: [0.02, 0.05, 0.1, 0.2], scores: { [CENTER]: 0.9 } },
          { anchor: 1028, box: [0.98, 0.95, 0.1, 0.2], scores: { [FEATHER]: 0.9 } },
        ]),
        entry,
      );
      const [topLeft, bottomRight] = out;
      expect(topLeft.bbox[0]).toBe(0);
      expect(topLeft.bbox[1]).toBe(0);
      expect(topLeft.bbox[2]).toBeCloseTo(0.07);
      expect(topLeft.bbox[3]).toBeCloseTo(0.15);
      expect(bottomRight.bbox[0] + bottomRight.bbox[2]).toBeCloseTo(1);
      expect(bottomRight.bbox[1] + bottomRight.bbox[3]).toBeCloseTo(1);
      for (const d of out) for (const v of d.bbox) expect(v >= 0 && v <= 1).toBe(true);
    });

    test('a box entirely outside the input is dropped', () => {
      expect(
        normaliseBox({ label: 'x', labelIndex: 0, score: 1, x1: 230, y1: 10, x2: 260, y2: 40 }, 224, 224),
      ).toBeNull();
    });

    test('an output of the wrong size throws', () => {
      expect(() => parseTreadWearOutput(new Float32Array(8 * ANCHORS), entry)).toThrow(/expected/);
      expect(() => parseTreadWearOutput([[[0]]], entry)).toThrow(/rows/);
    });

    test('a manifest whose labels are not the wear classes throws', () => {
      expect(() =>
        parseTreadWearOutput(new Float32Array(ROWS * ANCHORS), { ...entry, labels: [...entry.labels].reverse() }),
      ).toThrow(/tread wear classes/);
    });
  });
});
