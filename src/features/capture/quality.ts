import type { CaptureErrorReason } from '../inspection/types';
import { captureConfig } from '../../config/capture';

// Frame quality checks (spec §7). The measuring functions are worklets: they
// run on the camera thread on the luminance plane, and are plain functions in tests.

export type LumaMetrics = {
  /** Mean luminance 0–255. */
  brightness: number;
  /** Laplacian variance (higher is sharper). */
  sharpness: number;
  /** 16×16 grid of mean luminance, for motion and novelty. */
  thumb: number[];
};

export const THUMB_SIZE = captureConfig.thumbSize;

/**
 * Measures a centred square region of an 8-bit luminance plane.
 * `region` is the square's side as a fraction of the shorter frame side.
 */
export function measureLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  region: number,
  step: number,
): LumaMetrics {
  'worklet';
  const side = Math.floor(Math.min(width, height) * region);
  const x0 = Math.floor((width - side) / 2);
  const y0 = Math.floor((height - side) / 2);
  const cell = side / THUMB_SIZE;
  const thumbSum: number[] = new Array(THUMB_SIZE * THUMB_SIZE).fill(0);
  const thumbCount: number[] = new Array(THUMB_SIZE * THUMB_SIZE).fill(0);

  let sum = 0;
  let count = 0;
  let lapSum = 0;
  let lapSq = 0;
  let lapCount = 0;

  for (let y = y0; y < y0 + side; y += step) {
    const row = y * bytesPerRow;
    const cy = Math.min(THUMB_SIZE - 1, Math.floor((y - y0) / cell));
    for (let x = x0; x < x0 + side; x += step) {
      const v = luma[row + x];
      sum += v;
      count++;
      const cx = Math.min(THUMB_SIZE - 1, Math.floor((x - x0) / cell));
      thumbSum[cy * THUMB_SIZE + cx] += v;
      thumbCount[cy * THUMB_SIZE + cx]++;
      // 4-neighbour Laplacian at the sampling step, skipping the border.
      if (x - step >= x0 && x + step < x0 + side && y - step >= y0 && y + step < y0 + side) {
        const lap =
          4 * v -
          luma[row + x - step] -
          luma[row + x + step] -
          luma[row - step * bytesPerRow + x] -
          luma[row + step * bytesPerRow + x];
        lapSum += lap;
        lapSq += lap * lap;
        lapCount++;
      }
    }
  }
  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const thumb = thumbSum.map((s, i) => (thumbCount[i] > 0 ? s / thumbCount[i] : 0));
  return {
    brightness: count > 0 ? sum / count : 0,
    sharpness: lapCount > 0 ? lapSq / lapCount - lapMean * lapMean : 0,
    thumb,
  };
}

/** Mean absolute difference between two thumbnails (0–255). */
export function thumbDifference(a: number[] | null, b: number[] | null): number {
  'worklet';
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

/** What's wrong with a frame, or `ok`. Order matters: light first, then motion, then blur. */
export type FrameIssue = 'ok' | 'too_dark' | 'too_bright' | 'moving' | 'blurry';

export type QualityThresholds = {
  minBrightness: number;
  maxBrightness: number;
  minSharpness: number;
  maxSteadyMotion: number;
};

/**
 * `motion` is the difference from the previous analysed frame. Sidewall frames
 * must be steady; tread frames are taken while sweeping, so pass
 * `requireSteady: false` and rely on sharpness to reject motion blur.
 */
export function classifyFrame(
  m: { brightness: number; sharpness: number },
  motion: number,
  t: QualityThresholds,
  requireSteady: boolean,
): FrameIssue {
  'worklet';
  if (m.brightness < t.minBrightness) return 'too_dark';
  if (m.brightness > t.maxBrightness) return 'too_bright';
  if (requireSteady && motion > t.maxSteadyMotion) return 'moving';
  if (m.sharpness < t.minSharpness) return 'blurry';
  return 'ok';
}

/**
 * One analysed frame as the session sees it: a quality issue, `repeat` (tread:
 * the sweep hasn't moved on) or `reverse` (tread: moving left, the one-way
 * sweep is frozen until it moves right again; owner request 2026-11-12).
 */
export type SampleIssue = FrameIssue | 'repeat' | 'reverse';

export type IssueCounts = Record<Exclude<SampleIssue, 'ok'>, number>;

export const emptyIssueCounts = (): IssueCounts => ({
  too_dark: 0,
  too_bright: 0,
  moving: 0,
  blurry: 0,
  repeat: 0,
  reverse: 0,
});

/**
 * The reason shown on Capture problem: the most common reason frames were
 * rejected (too dark → `dark`, overexposed → `glare`, blurred → `blur`,
 * moving → `unsteady`). `distance` and `not_found` are only possible with the
 * tyre detector's counts. With no clear cause (e.g. standing still on the
 * tread, or no frames at all) → `too_few_frames`.
 */
export function problemReason(
  counts: IssueCounts,
  detector: { outOfRange: number; notFound: number } | null = null,
): CaptureErrorReason {
  const candidates: [CaptureErrorReason, number][] = [
    ['dark', counts.too_dark],
    ['glare', counts.too_bright],
    ['blur', counts.blurry],
    ['unsteady', counts.moving],
  ];
  if (detector) {
    candidates.push(['distance', detector.outOfRange], ['not_found', detector.notFound]);
  }
  const [reason, n] = candidates.reduce((best, c) => (c[1] > best[1] ? c : best));
  return n > 0 ? reason : 'too_few_frames';
}
