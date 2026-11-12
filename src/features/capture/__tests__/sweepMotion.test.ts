import {
  PROFILE_BINS,
  advanceSweep,
  initialSweep,
  measureProfiles,
  profileShift,
  rightwardTravel,
  screenXAxis,
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
    const prev = { cols: shifted(0), rows: shifted(0) };
    // Orientation up: content moves to lower buffer x.
    const up = rightwardTravel(prev, { cols: shifted(-3), rows: shifted(0) }, 'up', false)!;
    expect(up).toBeGreaterThan(0);
    // iPhone upright (left): screen left is buffer +y, so content moves to higher buffer y.
    const left = rightwardTravel(prev, { cols: shifted(0), rows: shifted(3) }, 'left', false)!;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeCloseTo(3 / PROFILE_BINS, 2);
    expect(rightwardTravel(prev, { cols: shifted(0), rows: shifted(-3) }, 'left', false)!).toBeLessThan(0);
    expect(rightwardTravel(null, prev, 'left', false)).toBeNull();
  });
});

describe('measureProfiles', () => {
  test('column and row means of the centre square', () => {
    const W = 480;
    const H = 360;
    const plane = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) plane[y * W + x] = x < W / 2 ? 0 : 200;
    const p = measureProfiles(plane, W, H, W, 1, 4);
    expect(p.cols).toHaveLength(PROFILE_BINS);
    expect(p.cols[0]).toBe(0);
    expect(p.cols[PROFILE_BINS - 1]).toBe(200);
    expect(new Set(p.rows.map(v => Math.round(v))).size).toBe(1);
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

  test('moving left locks without taking travel back; only rightward movement releases it', () => {
    let s = advanceSweep(initialSweep(), 0.5);
    s = advanceSweep(s, -0.2);
    expect(s).toEqual({ travel: 0.5, reversed: true });
    s = advanceSweep(s, -0.3);
    s = advanceSweep(s, 0);
    s = advanceSweep(s, null);
    expect(s).toEqual({ travel: 0.5, reversed: true });
    s = advanceSweep(s, 0.1);
    expect(s.reversed).toBe(false);
    expect(s.travel).toBeCloseTo(0.6);
  });

  test('fill is travel over treadSweepTravel, clamped', () => {
    expect(sweepFill(0)).toBe(0);
    expect(sweepFill(captureConfig.treadSweepTravel / 2)).toBeCloseTo(0.5);
    expect(sweepFill(99)).toBe(1);
  });
});
