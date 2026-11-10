/* eslint-env jest */
// TEST-ONLY: synthetic SSD outputs in the tread wear model's layout.
// raw_boxes `[1, A, 4]` (dx, dy, dw, dh per anchor, anchor-major) and
// raw_scores `[1, A, L]` (L probabilities per anchor, summing to 1).

import type { SsdDetectorManifestEntry } from '../../manifest';

export type SsdAnchorOutput = {
  anchor: number;
  /** Raw offsets; zeros decode to the anchor itself. */
  deltas?: [number, number, number, number];
  /** Label index → probability. The rest of the mass goes to the background. */
  scores: Record<number, number>;
};

export function ssdOutputs(
  entry: SsdDetectorManifestEntry,
  anchors: SsdAnchorOutput[],
): { boxes: Float32Array; scores: Float32Array } {
  const count = entry.outputs.boxes.shape[1];
  const labels = entry.labels.length;
  const boxes = new Float32Array(count * 4);
  const scores = new Float32Array(count * labels);
  for (let j = 0; j < count; j++) scores[j * labels + entry.backgroundIndex] = 1;
  for (const a of anchors) {
    (a.deltas ?? [0, 0, 0, 0]).forEach((v, i) => (boxes[a.anchor * 4 + i] = v));
    let rest = 1;
    for (const [cls, p] of Object.entries(a.scores)) {
      scores[a.anchor * labels + Number(cls)] = p;
      rest -= p;
    }
    scores[a.anchor * labels + entry.backgroundIndex] = Math.max(0, rest);
  }
  return { boxes, scores };
}

/** Index of the anchor at cell (x, y), pair `k`, of feature map `level`. */
export function anchorIndex(entry: SsdDetectorManifestEntry, level: number, x: number, y: number, k = 0): number {
  const { featureMapSizes, aspectRatios } = entry.anchors;
  const perCell = (l: number) => 2 + 2 * aspectRatios[l].length;
  let start = 0;
  for (let l = 0; l < level; l++) start += featureMapSizes[l] ** 2 * perCell(l);
  return start + (y * featureMapSizes[level] + x) * perCell(level) + k;
}
