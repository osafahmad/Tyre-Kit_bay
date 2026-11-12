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

/** Profile bins across the analysed square, per axis. */
export const PROFILE_BINS = captureConfig.sweepProfileBins;

/**
 * Mean luminance of the centre square by buffer column (`cols`, along buffer x)
 * and by buffer row (`rows`, along buffer y). `region` and `step` as in `measureLuma`.
 */
export function measureProfiles(
  luma: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  region: number,
  step: number,
): { cols: number[]; rows: number[] } {
  'worklet';
  const side = Math.floor(Math.min(width, height) * region);
  const x0 = Math.floor((width - side) / 2);
  const y0 = Math.floor((height - side) / 2);
  const bin = side / PROFILE_BINS;
  const colSum: number[] = new Array(PROFILE_BINS).fill(0);
  const colCount: number[] = new Array(PROFILE_BINS).fill(0);
  const rowSum: number[] = new Array(PROFILE_BINS).fill(0);
  const rowCount: number[] = new Array(PROFILE_BINS).fill(0);
  for (let y = y0; y < y0 + side; y += step) {
    const row = y * bytesPerRow;
    const by = Math.min(PROFILE_BINS - 1, Math.floor((y - y0) / bin));
    for (let x = x0; x < x0 + side; x += step) {
      const v = luma[row + x];
      const bx = Math.min(PROFILE_BINS - 1, Math.floor((x - x0) / bin));
      colSum[bx] += v;
      colCount[bx]++;
      rowSum[by] += v;
      rowCount[by]++;
    }
  }
  return {
    cols: colSum.map((s, i) => (colCount[i] > 0 ? s / colCount[i] : 0)),
    rows: rowSum.map((s, i) => (rowCount[i] > 0 ? s / rowCount[i] : 0)),
  };
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
 */
export function profileShift(prev: number[] | null, cur: number[] | null, maxShift: number): number | null {
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
 * the analysed square's width. The camera moving right moves the scene left
 * on screen, so this is minus the on-screen content shift. Null when unknown.
 */
export function rightwardTravel(
  prev: { cols: number[]; rows: number[] } | null,
  cur: { cols: number[]; rows: number[] },
  orientation: string,
  isMirrored: boolean,
): number | null {
  'worklet';
  if (!prev) return null;
  const { axis, sign } = screenXAxis(orientation, isMirrored);
  const shift = profileShift(prev[axis], cur[axis], captureConfig.sweepMaxShiftBins);
  if (shift === null) return null;
  return (-sign * shift) / PROFILE_BINS;
}

export type SweepState = {
  /** Rightward travel so far, in analysed-square widths. Never decreases. */
  travel: number;
  /** Moved left since the last rightward movement: chevrons and capture are frozen. */
  reversed: boolean;
};

export const initialSweep = (): SweepState => ({ travel: 0, reversed: false });

/**
 * One analysed frame's travel applied to the sweep. Right past the dead band
 * adds travel and releases the lock; left past it locks; anything else
 * (still, jitter, unknown) changes nothing.
 */
export function advanceSweep(state: SweepState, travel: number | null): SweepState {
  'worklet';
  if (travel === null) return state;
  const dead = captureConfig.sweepDeadBand;
  if (travel >= dead) return { travel: state.travel + travel, reversed: false };
  if (travel <= -dead) return state.reversed ? state : { travel: state.travel, reversed: true };
  return state;
}

/** Fill of the 4 chevrons, 0..1, from travel; full at `treadSweepTravel`. */
export const sweepFill = (travel: number) => Math.max(0, Math.min(1, travel / captureConfig.treadSweepTravel));
