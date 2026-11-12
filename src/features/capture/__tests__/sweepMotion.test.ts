import {
  PROFILE_BINS,
  advanceSweep,
  initialSweep,
  measureSweepProfile,
  profileShift,
  rightwardTravel,
  screenXAxis,
  sweepAllowsFrame,
  sweepFill,
} from '../sweepMotion';
import { captureConfig } from '../../../config/capture';

/** A textured strip: pseudo-random but repeatable luminance by position. */
const texture = (i: number) => 128 + Math.round(60 * Math.sin(i * 0.37) + 40 * Math.sin(i * 1.13 + 1));
const shifted = (by: number) => Array.from({ length: PROFILE_BINS }, (_, i) => texture(i - by));

describe('profileShift', () => {
  test('finds the shift of textured content, in either direction', () => {
    const base = shifted(0);
    expect(profileShift(base, shifted(3), 10)).toBeCloseTo(3, 0);
    expect(profileShift(base, shifted(-4), 10)).toBeCloseTo(-4, 0);
    expect(profileShift(base, base, 10)).toBeCloseTo(0, 0);
  });

  test('repetitive texture: of near-equal matches, the one nearest the previous shift wins', () => {
    // Period 12 bins: a shift of +3 matches the same as −9.
    const periodic = (by: number) => Array.from({ length: PROFILE_BINS }, (_, i) => 128 + Math.round(80 * Math.sin(((i - by) * 2 * Math.PI) / 12)));
    expect(profileShift(periodic(0), periodic(3), 10, 3)).toBeCloseTo(3, 0);
    expect(profileShift(periodic(0), periodic(3), 10, -8)).toBeCloseTo(-9, 0);
  });

  test('flat profiles or missing data give no shift', () => {
    const flat = new Array(PROFILE_BINS).fill(100);
    expect(profileShift(flat, flat, 10)).toBeNull();
    expect(profileShift(null, shifted(0), 10)).toBeNull();
  });

  test('ignores a brightness change (auto-exposure)', () => {
    const brighter = shifted(2).map(v => v + 30);
    expect(profileShift(shifted(0), brighter, 10)).toBeCloseTo(2, 0);
  });
});

describe('screen axis from frame orientation', () => {
  test('iPhone upright (left): screen +x is buffer −y', () => {
    expect(screenXAxis('left', false)).toEqual({ axis: 'rows', sign: -1 });
    expect(screenXAxis('right', false)).toEqual({ axis: 'rows', sign: 1 });
    expect(screenXAxis('up', false)).toEqual({ axis: 'cols', sign: 1 });
    expect(screenXAxis('down', false)).toEqual({ axis: 'cols', sign: -1 });
    expect(screenXAxis('up', true)).toEqual({ axis: 'cols', sign: -1 });
  });

  test('camera moving right = content moving left on screen = positive travel', () => {
    const prev = shifted(0);
    // Orientation up (sign +1): content moves to lower buffer x.
    expect(rightwardTravel(prev, shifted(-3), 1)!).toBeGreaterThan(0);
    // iPhone upright (left, sign −1): screen left is buffer +y, so content moves to higher buffer y.
    const left = rightwardTravel(prev, shifted(3), screenXAxis('left', false).sign)!;
    expect(left).toBeCloseTo(3 / PROFILE_BINS, 2);
    expect(rightwardTravel(prev, shifted(-3), -1)!).toBeLessThan(0);
    expect(rightwardTravel(null, prev, -1)).toBeNull();
  });
});

describe('measureSweepProfile', () => {
  const W = 1280;
  const H = 720;
  test('runs along the whole chosen axis', () => {
    const plane = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) plane[y * W + x] = y < H / 2 ? 0 : 200;
    const rows = measureSweepProfile(plane, W, H, W, 'rows', 0.5, 4);
    expect(rows).toHaveLength(PROFILE_BINS);
    expect(rows[0]).toBe(0);
    expect(rows[PROFILE_BINS - 1]).toBe(200);
    const cols = measureSweepProfile(plane, W, H, W, 'cols', 0.5, 4);
    expect(new Set(cols.map(v => Math.round(v))).size).toBe(1);
  });

  test('a sweep simulated on a textured plane is tracked across the screen', () => {
    // A wide, irregular strip of texture; each frame sees a window of it shifted right by the camera.
    const rnd = (i: number) => {
      const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const scene = (x: number) => 60 + Math.round(140 * rnd(Math.floor(x / 24)));
    const h = 40;
    const frameAt = (offset: number) => {
      const plane = new Uint8Array(W * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) plane[y * W + x] = scene(x + offset);
      return measureSweepProfile(plane, W, h, W, 'cols', 0.5, 4);
    };
    let state = initialSweep();
    let prev: number[] | null = null;
    let last = 0;
    const step = (cur: number[]) => {
      const t = rightwardTravel(prev, cur, 1, last);
      last = t ?? 0;
      state = advanceSweep(state, t);
      prev = cur;
    };
    // 20 frames, each 4 % of the screen to the right: 0.8 screen widths in all.
    for (let i = 0; i <= 20; i++) {
      step(frameAt(Math.round(i * 0.04 * W)));
    }
    expect(state.reversed).toBe(false);
    expect(state.travel).toBeGreaterThan(0.7);
    expect(state.travel).toBeLessThan(0.9);
    // Then back left: locks, travel kept.
    for (let i = 19; i >= 17; i--) {
      step(frameAt(Math.round(i * 0.04 * W)));
    }
    expect(state.reversed).toBe(true);
    expect(state.travel).toBeGreaterThan(0.7);
  });
});

describe('one-way sweep latch', () => {
  const dead = captureConfig.sweepDeadBand;

  test('rightward travel adds up; still and jitter change nothing', () => {
    let s = initialSweep();
    s = advanceSweep(s, 0.1);
    s = advanceSweep(s, 0.2);
    expect(s.travel).toBeCloseTo(0.3);
    expect(advanceSweep(s, dead / 2)).toBe(s);
    expect(advanceSweep(s, -dead / 2)).toBe(s);
    expect(advanceSweep(s, null)).toBe(s);
  });

  test('moving left locks once it adds up to the latch, without taking travel back; only rightward movement releases it', () => {
    const latch = captureConfig.sweepReverseLatch;
    let s = advanceSweep(initialSweep(), 0.5);
    // One small noisy leftward frame doesn't lock.
    s = advanceSweep(s, -latch / 2);
    expect(s.reversed).toBe(false);
    s = advanceSweep(s, -latch / 2);
    expect(s).toMatchObject({ travel: 0.5, reversed: true });
    s = advanceSweep(s, -0.3);
    s = advanceSweep(s, 0);
    s = advanceSweep(s, null);
    expect(s).toMatchObject({ travel: 0.5, reversed: true });
    s = advanceSweep(s, 0.1);
    expect(s).toMatchObject({ reversed: false, back: 0 });
    expect(s.travel).toBeCloseTo(0.6);
  });

  test('frames follow the chevrons: one at the start, the last with all four full, none while locked', () => {
    const T = captureConfig.treadSweepTravel;
    const at = (fill: number, reversed = false) => ({ travel: fill * T, reversed, back: 0 });
    expect(sweepAllowsFrame(at(0), 0, 10)).toBe(true);
    expect(sweepAllowsFrame(at(0), 1, 10)).toBe(false);
    // A quarter (one chevron) allows frames up to 1 + 0.25 × 9 = 3.25 → 3 frames taken, a 4th not yet.
    expect(sweepAllowsFrame(at(0.25), 2, 10)).toBe(true);
    expect(sweepAllowsFrame(at(0.25), 3, 10)).toBe(false);
    expect(sweepAllowsFrame(at(1), 9, 10)).toBe(true);
    expect(sweepAllowsFrame(at(1), 10, 10)).toBe(false);
    expect(sweepAllowsFrame(at(1, true), 5, 10)).toBe(false);
  });

  test('fill is travel over treadSweepTravel, clamped', () => {
    expect(sweepFill(0)).toBe(0);
    expect(sweepFill(captureConfig.treadSweepTravel / 2)).toBeCloseTo(0.5);
    expect(sweepFill(99)).toBe(1);
  });
});
