import {
  THUMB_SIZE,
  classifyFrame,
  emptyIssueCounts,
  measureLuma,
  problemReason,
  thumbDifference,
} from '../quality';

const W = 64;
const H = 64;
const plane = (fn: (x: number, y: number) => number) => {
  const a = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = fn(x, y);
  return a;
};

describe('measureLuma', () => {
  test('brightness is the mean of the centre region', () => {
    const m = measureLuma(plane(() => 100), W, H, W, 0.5, 1);
    expect(m.brightness).toBe(100);
    expect(m.thumb).toHaveLength(THUMB_SIZE * THUMB_SIZE);
  });

  test('a flat image has no sharpness; detail has a lot', () => {
    const flat = measureLuma(plane(() => 128), W, H, W, 0.5, 1);
    const checker = measureLuma(plane((x, y) => ((x + y) % 2 ? 255 : 0)), W, H, W, 0.5, 1);
    expect(flat.sharpness).toBe(0);
    expect(checker.sharpness).toBeGreaterThan(10000);
  });

  test('respects row padding (bytesPerRow wider than width)', () => {
    const stride = W + 16;
    const a = new Uint8Array(stride * H).fill(255);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * stride + x] = 50;
    expect(measureLuma(a, W, H, stride, 0.5, 2).brightness).toBe(50);
  });
});

test('thumbnail difference', () => {
  expect(thumbDifference([10, 20], [10, 30])).toBe(5);
  expect(thumbDifference(null, [1])).toBe(Infinity);
});

describe('classifyFrame', () => {
  const t = { minBrightness: 55, maxBrightness: 215, minSharpness: 120, maxSteadyMotion: 6 };
  test('light is checked first', () => {
    expect(classifyFrame({ brightness: 20, sharpness: 0 }, 50, t, true)).toBe('too_dark');
    expect(classifyFrame({ brightness: 240, sharpness: 500 }, 0, t, true)).toBe('too_bright');
  });
  test('sidewall must be steady; tread may move but must be sharp', () => {
    expect(classifyFrame({ brightness: 120, sharpness: 500 }, 20, t, true)).toBe('moving');
    expect(classifyFrame({ brightness: 120, sharpness: 500 }, 20, t, false)).toBe('ok');
    expect(classifyFrame({ brightness: 120, sharpness: 50 }, 0, t, false)).toBe('blurry');
  });
});

describe('problemReason', () => {
  test('most common rejection wins', () => {
    expect(problemReason({ ...emptyIssueCounts(), too_dark: 5, blurry: 2 })).toBe('dark');
    expect(problemReason({ ...emptyIssueCounts(), too_dark: 1, blurry: 3, moving: 2 })).toBe('blur');
  });
  test('glare and unsteady frames get their own reasons', () => {
    expect(problemReason({ ...emptyIssueCounts(), too_bright: 9, blurry: 2 })).toBe('glare');
    expect(problemReason({ ...emptyIssueCounts(), moving: 6, blurry: 2 })).toBe('unsteady');
  });
  test('without the detector, "not found" is never the reason', () => {
    expect(problemReason(emptyIssueCounts())).toBe('too_few_frames');
    expect(problemReason({ ...emptyIssueCounts(), repeat: 9 })).toBe('too_few_frames');
  });
  test('with a detector, distance and "not found" become possible', () => {
    expect(problemReason(emptyIssueCounts(), { outOfRange: 4, notFound: 1 })).toBe('distance');
    expect(problemReason(emptyIssueCounts(), { outOfRange: 0, notFound: 3 })).toBe('not_found');
  });
});
