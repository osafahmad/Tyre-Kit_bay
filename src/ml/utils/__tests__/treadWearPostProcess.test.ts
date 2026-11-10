import { TREAD_WEAR_CLASSES } from '../../config/treadWearConfig';
import { anchorIndex, ssdOutputs } from '../../inference/__fixtures__/ssdOutputs';
import { ssdAnchorCount, ssdDefaultAnchors } from '../../inference/tensorUtils';
import { modelManifest } from '../../manifest';
import { hasTreadWearLabels, normaliseBox, parseTreadWearOutput } from '../treadWearPostProcess';

const entry = modelManifest.treadWear!;
const L = (label: (typeof TREAD_WEAR_CLASSES)[number]) => entry.labels.indexOf(label);
const CENTER = L('center_wear');
const FEATHER = L('feathering');
/** Level 0 (20 × 20), cell (10, 10), first anchor: centre 0.525, 0.2 × 0.2. */
const MID = anchorIndex(entry, 0, 10, 10);
const round = (b: number[]) => b.map(v => Number(v.toFixed(4)));

describe('torchvision default anchors (ssdlite320_mobilenet_v3_large)', () => {
  const anchors = ssdDefaultAnchors(entry.anchors);

  test('3234 anchors, matching the model outputs', () => {
    expect(anchors).toHaveLength(3234);
    expect(ssdAnchorCount(entry.anchors)).toBe(3234);
    expect(entry.outputs.boxes.shape[1]).toBe(3234);
  });

  test('first cell: s_k, sqrt(s_k · s_k+1), then w/h and h/w for ratios 2 and 3', () => {
    const s0 = 0.2;
    const prime = Math.sqrt(0.2 * 0.35);
    const expected = [
      [s0, s0],
      [prime, prime],
      [s0 * Math.SQRT2, s0 / Math.SQRT2],
      [s0 / Math.SQRT2, s0 * Math.SQRT2],
      [s0 * Math.sqrt(3), s0 / Math.sqrt(3)],
      [s0 / Math.sqrt(3), s0 * Math.sqrt(3)],
    ];
    anchors.slice(0, 6).forEach((a, k) => {
      expect(a.cx).toBeCloseTo(0.025);
      expect(a.cy).toBeCloseTo(0.025);
      expect(a.w).toBeCloseTo(expected[k][0]);
      expect(a.h).toBeCloseTo(expected[k][1]);
    });
  });

  test('cells run row by row: the next anchor set moves along x', () => {
    expect(anchors[6]).toEqual(expect.objectContaining({ cx: 1.5 / 20, cy: 0.5 / 20 }));
    expect(anchors[20 * 6]).toEqual(expect.objectContaining({ cx: 0.5 / 20, cy: 1.5 / 20 }));
    expect(anchors[MID]).toEqual(expect.objectContaining({ cx: 10.5 / 20, cy: 10.5 / 20 }));
  });

  test('last map (1 × 1, scale 0.95): widths and heights are clipped to 1', () => {
    const last = anchors.slice(-6);
    expect(last[0]).toEqual(expect.objectContaining({ cx: 0.5, cy: 0.5 }));
    expect(last[0].w).toBeCloseTo(0.95);
    expect(last[1].w).toBeCloseTo(Math.sqrt(0.95));
    expect(last[2].w).toBe(1); // 0.95 · √2 > 1
    expect(last[2].h).toBeCloseTo(0.95 / Math.SQRT2);
    expect(last[5].h).toBe(1);
  });
});

describe('parseTreadWearOutput', () => {
  const run = (anchors: Parameters<typeof ssdOutputs>[1], t = {}) => {
    const { boxes, scores } = ssdOutputs(entry, anchors);
    return parseTreadWearOutput(boxes, scores, entry, t);
  };

  test('zero offsets decode to the anchor, as typed, normalised [x, y, w, h]', () => {
    const [d, ...rest] = run([{ anchor: MID, scores: { [CENTER]: 0.8 } }]);
    expect(rest).toEqual([]);
    expect(d.label).toBe('center_wear');
    expect(d.confidence).toBeCloseTo(0.8);
    expect(round(d.bbox)).toEqual([0.425, 0.425, 0.2, 0.2]);
  });

  test('offsets use box coder weights (10, 10, 5, 5)', () => {
    const [d] = run([{ anchor: MID, deltas: [1, -2, 5 * Math.log(2), 0], scores: { [CENTER]: 0.9 } }]);
    // cx = 0.525 + 1/10 · 0.2, cy = 0.525 − 2/10 · 0.2, w = 0.2 · 2, h = 0.2.
    expect(round(d.bbox)).toEqual(round([0.545 - 0.2, 0.485 - 0.1, 0.4, 0.2]));
  });

  test('dw/dh are clamped at log(1000/16) and the box is clamped to the input', () => {
    const [d] = run([{ anchor: MID, deltas: [0, 0, 1000, 1000], scores: { [CENTER]: 0.9 } }]);
    expect(round(d.bbox)).toEqual([0, 0, 1, 1]);
    // Corner anchor: half of it is off the input and is cut away.
    const [corner] = run([{ anchor: 0, scores: { [CENTER]: 0.9 } }]);
    expect(round(corner.bbox)).toEqual([0, 0, 0.125, 0.125]);
  });

  test('the background class is never reported, even when it is the top score', () => {
    expect(run([{ anchor: MID, scores: { [CENTER]: 0.4 } }]).map(d => d.label)).toEqual(['center_wear']);
    expect(run([])).toEqual([]);
  });

  test('best non-background class per anchor; below 0.35 is dropped', () => {
    const out = run([{ anchor: MID, scores: { [CENTER]: 0.2, [FEATHER]: 0.36 } }]);
    expect(out.map(d => d.label)).toEqual(['feathering']);
    expect(run([{ anchor: MID, scores: { [CENTER]: 0.34 } }])).toEqual([]);
    expect(run([{ anchor: MID, scores: { [CENTER]: 0.34 } }], { confidenceThreshold: 0.3 })).toHaveLength(1);
  });

  test('scores are used as probabilities: no second softmax', () => {
    const [d] = run([{ anchor: MID, scores: { [CENTER]: 0.5 } }]);
    expect(d.confidence).toBeCloseTo(0.5);
  });

  test('a logits manifest is softmaxed per anchor', () => {
    const logits = { ...entry, scores: 'logits' as const };
    const { boxes, scores } = ssdOutputs(entry, []);
    scores.fill(0);
    scores[MID * entry.labels.length + CENTER] = 3; // e^3 / (e^3 + 15) ≈ 0.57
    const [d] = parseTreadWearOutput(boxes, scores, logits);
    expect(d.confidence).toBeCloseTo(Math.exp(3) / (Math.exp(3) + 15));
  });

  test('NMS per class at IoU 0.45: same-class overlap merges, other classes stay', () => {
    const next = MID + 1; // same cell, sqrt(s0·s1) anchor: IoU with MID ≈ 0.57
    const same = run([
      { anchor: MID, scores: { [CENTER]: 0.9 } },
      { anchor: next, scores: { [CENTER]: 0.7 } },
    ]);
    expect(same).toHaveLength(1);
    expect(same[0].confidence).toBeCloseTo(0.9);
    const both = run([
      { anchor: MID, scores: { [CENTER]: 0.9 } },
      { anchor: next, scores: { [FEATHER]: 0.7 } },
    ]);
    expect(both.map(d => d.label)).toEqual(['center_wear', 'feathering']);
    expect(
      run(
        [
          { anchor: MID, scores: { [CENTER]: 0.9 } },
          { anchor: next, scores: { [CENTER]: 0.7 } },
        ],
        { iouThreshold: 0.7 },
      ),
    ).toHaveLength(2);
  });

  test('accepts ArrayBuffers, Float32Array views and nested arrays alike', () => {
    const { boxes, scores } = ssdOutputs(entry, [{ anchor: MID, scores: { [CENTER]: 0.8 } }]);
    const expected = parseTreadWearOutput(boxes.slice().buffer, scores.slice().buffer, entry);
    const big = new Float32Array(boxes.length + 8);
    big.set(boxes, 8);
    const view = big.subarray(8);
    const nest = (t: Float32Array, n: number) => [
      Array.from({ length: t.length / n }, (_, j) => Array.from(t.subarray(j * n, (j + 1) * n))),
    ];
    expect(expected).toHaveLength(1);
    expect(parseTreadWearOutput(view, scores, entry)).toEqual(expected);
    expect(parseTreadWearOutput(nest(boxes, 4), nest(scores, 16), entry)).toEqual(expected);
  });

  test('throws on outputs that do not match the manifest', () => {
    const { boxes, scores } = ssdOutputs(entry, []);
    expect(() => parseTreadWearOutput(boxes.subarray(4), scores, entry)).toThrow(/Box output/);
    expect(() => parseTreadWearOutput(boxes, scores.subarray(16), entry)).toThrow(/Score output/);
    expect(() => parseTreadWearOutput([[[0]]], scores, entry)).toThrow(/anchors/);
    // Swapped tensors fail rather than decode nonsense.
    expect(() => parseTreadWearOutput(scores, boxes, entry)).toThrow();
  });

  test('throws when the manifest labels are not the tread wear classes', () => {
    expect(hasTreadWearLabels(entry)).toBe(true);
    const { boxes, scores } = ssdOutputs(entry, []);
    const reversed = { ...entry, labels: [...entry.labels].reverse() };
    expect(() => parseTreadWearOutput(boxes, scores, reversed)).toThrow(/tread wear classes/);
  });
});

describe('normaliseBox', () => {
  test('clamps to the input and drops boxes with no area', () => {
    const d = { label: 'x', labelIndex: 1, score: 1 };
    expect(normaliseBox({ ...d, x1: -10, y1: 0, x2: 160, y2: 320 }, 320, 320)).toEqual([0, 0, 0.5, 1]);
    expect(normaliseBox({ ...d, x1: 330, y1: 0, x2: 340, y2: 10 }, 320, 320)).toBeNull();
  });
});
