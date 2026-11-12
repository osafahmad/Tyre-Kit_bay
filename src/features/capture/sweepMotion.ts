import { captureConfig } from '../../config/capture';

/**
 * Tread sweep direction (owner request 2026-11-12, iPhone 13 test): the
 * chevrons on Tread capture fill with real rightward camera travel, and the
 * sweep is one-way. Moving back (left) freezes the chevrons and frame capture
 * until rightward movement resumes. Nothing is ever taken back.
 *
 * Motion is a 1D shift between luminance profiles of consecutive analysed
 * frames, measured along the buffer axis that is horizontal on screen. Worklets:
 * they run on the camera thread, and are plain functions in tests.
 */

/** Profile bins along the on-screen horizontal axis. */
export const PROFILE_BINS = captureConfig.sweepProfileBins;

/**
 * Mean luminance along one buffer axis (`cols`: along buffer x, `rows`: along
 * buffer y), over that axis's WHOLE length (round 2, iPhone 13 video: the
 * centre square gave too little overlap for a normal sweep), averaged over a
 * centred band of the other axis (`band`, a fraction of it). `step` as in `measureLuma`.
 */
export function measureSweepProfile(
  luma: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  axis: 'cols' | 'rows',
  band: number,
  step: number,
): number[] {
  'worklet';
  const along = axis === 'cols' ? width : height;
  const across = axis === 'cols' ? height : width;
  const a0 = Math.floor((across * (1 - band)) / 2);
  const a1 = Math.min(across, a0 + Math.max(1, Math.floor(across * band)));
  const bin = along / PROFILE_BINS;
  const sum: number[] = new Array(PROFILE_BINS).fill(0);
  const count: number[] = new Array(PROFILE_BINS).fill(0);
  if (axis === 'cols') {
    for (let y = a0; y < a1; y += step) {
      const row = y * bytesPerRow;
      for (let x = 0; x < width; x += step) {
        const b = Math.min(PROFILE_BINS - 1, Math.floor(x / bin));
        sum[b] += luma[row + x];
        count[b]++;
      }
    }
  } else {
    for (let y = 0; y < height; y += step) {
      const row = y * bytesPerRow;
      const b = Math.min(PROFILE_BINS - 1, Math.floor(y / bin));
      for (let x = a0; x < a1; x += step) {
        sum[b] += luma[row + x];
        count[b]++;
      }
    }
  }
  return sum.map((v, i) => (count[i] > 0 ? v / count[i] : 0));
}

/**
 * Which buffer profile runs left → right on screen, and in which direction.
 * `frame.orientation` (VisionCamera 5): `left` = pixel data rotated −90°, the
 * scene's top on the buffer's left (iPhone held upright), so screen +x is
 * buffer −y. `right`: screen +x is buffer +y. `down`: buffer −x. Mirroring
 * flips it.
 */
export function screenXAxis(orientation: string, isMirrored: boolean): { axis: 'cols' | 'rows'; sign: 1 | -1 } {
  'worklet';
  let axis: 'cols' | 'rows' = 'cols';
  let sign: 1 | -1 = 1;
  if (orientation === 'left') {
    axis = 'rows';
    sign = -1;
  } else if (orientation === 'right') {
    axis = 'rows';
  } else if (orientation === 'down') {
    sign = -1;
  }
  return { axis, sign: isMirrored ? (-sign as 1 | -1) : sign };
}

/**
 * Shift of `cur` relative to `prev`, in bins: positive when the content moved
 * toward higher indices. Mean absolute difference of the zero-mean profiles
 * over the overlap, searched to ±`maxShift`, refined to a fraction of a bin.
 * Null when either profile is too flat to say (no texture) or the best match
 * isn't clearly better than the worst (no reliable motion).
 *
 * Tread is repetitive, so several shifts can match almost equally well (a
 * shift and that shift plus one tread period). Among matches within
 * `sweepAliasTolerance` of the best, the one closest to `predicted` (the
 * previous frame's shift: hand motion is smooth) is taken.
 */
export function profileShift(
  prev: number[] | null,
  cur: number[] | null,
  maxShift: number,
  predicted = 0,
): number | null {
  'worklet';
  if (!prev || !cur || prev.length !== cur.length || prev.length < maxShift * 2 + 2) return null;
  const n = prev.length;
  let pm = 0;
  let cm = 0;
  for (let i = 0; i < n; i++) {
    pm += prev[i];
    cm += cur[i];
  }
  pm /= n;
  cm /= n;
  let pv = 0;
  let cv = 0;
  for (let i = 0; i < n; i++) {
    pv += Math.abs(prev[i] - pm);
    cv += Math.abs(cur[i] - cm);
  }
  if (pv / n < captureConfig.sweepMinTexture || cv / n < captureConfig.sweepMinTexture) return null;

  const costs: number[] = [];
  let best = 0;
  let worst = 0;
  for (let s = -maxShift; s <= maxShift; s++) {
    let d = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const j = i + s;
      if (j < 0 || j >= n) continue;
      d += Math.abs(prev[i] - pm - (cur[j] - cm));
      count++;
    }
    const cost = d / count;
    costs.push(cost);
    if (cost < costs[best]) best = costs.length - 1;
    if (cost > costs[worst]) worst = costs.length - 1;
  }
  if (costs[best] > costs[worst] * captureConfig.sweepMaxMatchRatio) return null;
  const nearBest = costs[best] + (costs[worst] - costs[best]) * captureConfig.sweepAliasTolerance;
  for (let k = 0; k < costs.length; k++) {
    const isLocalMin = (k === 0 || costs[k] <= costs[k - 1]) && (k === costs.length - 1 || costs[k] <= costs[k + 1]);
    if (!isLocalMin || costs[k] > nearBest) continue;
    if (Math.abs(k - maxShift - predicted) < Math.abs(best - maxShift - predicted)) best = k;
  }
  let shift = best - maxShift;
  if (best > 0 && best < costs.length - 1) {
    const a = costs[best - 1];
    const b = costs[best];
    const c = costs[best + 1];
    const denom = a - 2 * b + c;
    if (denom > 0) shift += (0.5 * (a - c)) / denom;
  }
  return shift;
}

/**
 * Rightward camera travel since the previous analysed frame, as a fraction of
 * the screen width, from two profiles of the same axis (`screenXAxis`). The
 * camera moving right moves the scene left on screen, so this is minus the
 * on-screen content shift. Null when unknown.
 */
export function rightwardTravel(prev: number[] | null, cur: number[], sign: 1 | -1, previousTravel = 0): number | null {
  'worklet';
  if (!prev) return null;
  // The previous frame's travel, back in bins of on-screen content shift, as the prediction.
  const predicted = (-sign * previousTravel * PROFILE_BINS);
  const shift = profileShift(prev, cur, captureConfig.sweepMaxShiftBins, predicted);
  if (shift === null) return null;
  return (-sign * shift) / PROFILE_BINS;
}

export type SweepState = {
  /** Rightward travel so far, in screen widths. Never decreases. */
  travel: number;
  /** Moved left since the last rightward movement: chevrons and capture are frozen. */
  reversed: boolean;
  /** Leftward travel since the last rightward movement; locks at `sweepReverseLatch`. */
  back: number;
};

export const initialSweep = (): SweepState => ({ travel: 0, reversed: false, back: 0 });

/**
 * One analysed frame's travel applied to the sweep. Right past the dead band
 * adds travel and releases the lock. Left past it adds to `back`, and the
 * sweep locks once `back` reaches `sweepReverseLatch` (round 2: one noisy
 * frame no longer flips it). Still, jitter and unknown change nothing.
 */
export function advanceSweep(state: SweepState, travel: number | null): SweepState {
  'worklet';
  if (travel === null) return state;
  const dead = captureConfig.sweepDeadBand;
  if (travel >= dead) return { travel: state.travel + travel, reversed: false, back: 0 };
  if (travel <= -dead) {
    const back = state.back - travel;
    return { travel: state.travel, reversed: state.reversed || back >= captureConfig.sweepReverseLatch, back };
  }
  return state;
}

/** Fill of the 4 chevrons, 0..1, from travel; full at `treadSweepTravel`. */
export function sweepFill(travel: number): number {
  'worklet';
  return Math.max(0, Math.min(1, travel / captureConfig.treadSweepTravel));
}

/**
 * Round 2 (iPhone 13 video: frames kept coming while the chevrons were
 * frozen): tread frames follow the chevrons. Frame `taken + 1` of `target`
 * may be taken only once the fill reaches `taken / (target − 1)`: the first
 * at the start, the last with all 4 chevrons full, so each chevron (25 %) is
 * a quarter of the frames. Never while the sweep is locked.
 */
export function sweepAllowsFrame(state: SweepState, taken: number, target: number): boolean {
  'worklet';
  if (state.reversed) return false;
  if (taken >= target) return false;
  if (target <= 1) return true;
  return sweepFill(state.travel) + 1e-9 >= taken / (target - 1);
}
