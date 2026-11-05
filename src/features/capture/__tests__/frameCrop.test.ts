import * as VC from 'react-native-vision-camera';
import { cropFrameToGuide } from '../frameCrop';

// The shared camera-thread step used by plate/chassis OCR and tyre capture.

const converter = VC.HybridFrameConverter as unknown as { convertFrameToImage: jest.Mock };

type FakeImage = {
  width: number;
  height: number;
  dispose: jest.Mock;
  rotate: jest.Mock;
  crop: jest.Mock;
};
function image(width: number, height: number): FakeImage {
  return {
    width,
    height,
    dispose: jest.fn(),
    // A redraw keeps the (already upright) size; a real ±90 would swap it.
    rotate: jest.fn((deg: number) => (deg % 180 === 0 ? image(width, height) : image(height, width))),
    crop: jest.fn((x0: number, y0: number, x1: number, y1: number) => image(x1 - x0, y1 - y0)),
  };
}

const frame = (orientation: string, isMirrored = false) =>
  ({ width: 1920, height: 1080, orientation, isMirrored }) as never;

// Portrait view 390x520 with a 260x150 guide in the middle.
const geometry = { guide: { x: 65, y: 185, width: 260, height: 150 }, view: { width: 390, height: 520 }, margin: 0 };

let converted: FakeImage;
beforeEach(() => {
  // As on the device: iOS UIImage with flag `left` reports the upright size 1080x1920.
  converted = image(1080, 1920);
  converter.convertFrameToImage = jest.fn(() => converted);
});

test('iOS left (phone upright): one redraw with the 180° correction, crops the redrawn image, disposes intermediates', () => {
  const r = cropFrameToGuide(frame('left'), geometry, 'ios', true);
  expect(r.ok).toBe(true);
  expect(converted.rotate).toHaveBeenCalledTimes(1);
  expect(converted.rotate).toHaveBeenCalledWith(180, false);
  const baked = converted.rotate.mock.results[0].value as FakeImage;
  expect(converted.crop).not.toHaveBeenCalled(); // never crop raw pixels
  expect(baked.crop).toHaveBeenCalledTimes(1);
  expect(converted.dispose).toHaveBeenCalledTimes(1);
  expect(baked.dispose).toHaveBeenCalledTimes(1);
  if (!r.ok) return;
  expect(r.image.dispose).not.toHaveBeenCalled(); // owned by the caller
  // Guide is wider than tall, and so is the crop (not a sideways strip).
  expect(r.image.width).toBeGreaterThan(r.image.height);
  expect(r.info).toMatchObject({ redrawn: true, correctionDegrees: 180, uprightWidth: 1080, uprightHeight: 1920 });
});

test('which images get redrawn, and by how much', () => {
  for (const [platform, o, expected] of [
    ['ios', 'up', null],
    ['ios', 'down', 0],
    ['ios', 'right', 180],
    ['android', 'left', 180],
    ['android', 'right', 180],
    ['android', 'up', null],
    ['android', 'down', null],
  ] as const) {
    converted = image(1080, 1920);
    const r = cropFrameToGuide(frame(o), geometry, platform, true);
    expect(r.ok).toBe(true);
    if (expected === null) {
      expect(converted.rotate).not.toHaveBeenCalled();
      expect(converted.crop).toHaveBeenCalledTimes(1);
    } else {
      expect(converted.rotate).toHaveBeenCalledTimes(1);
      expect(converted.rotate).toHaveBeenCalledWith(expected, false);
      expect(converted.crop).not.toHaveBeenCalled();
    }
    expect(converted.dispose).toHaveBeenCalledTimes(1);
  }
});

test('the crop is exactly the guide mapped through the cover preview', () => {
  // 1080x1920 into 390x520: scale = max(390/1080, 520/1920) = 0.3611; shown 390x693.3, 86.7pt cut top and bottom.
  const r = cropFrameToGuide(frame('left'), geometry, 'ios', true);
  const baked = converted.rotate.mock.results[0].value as FakeImage;
  const [x0, y0, x1, y1] = baked.crop.mock.calls[0];
  expect([x0, y0, x1, y1]).toEqual([180, 752, 900, 1167]);
  expect(r.info.rect).toEqual({ x: 180, y: 752, width: 720, height: 415 });
});

test('OCR (requireRect): no usable rect → no_rect, every intermediate disposed', () => {
  const r = cropFrameToGuide(frame('left'), { ...geometry, view: { width: 0, height: 0 } }, 'ios', true);
  expect(r).toMatchObject({ ok: false, reason: 'no_rect' });
  const baked = converted.rotate.mock.results[0].value as FakeImage;
  expect(converted.dispose).toHaveBeenCalledTimes(1);
  expect(baked.dispose).toHaveBeenCalledTimes(1);
});

test('tyre (no requireRect): no guide yet → the whole upright image is returned undisposed', () => {
  const r = cropFrameToGuide(frame('left'), null, 'ios', false);
  const baked = converted.rotate.mock.results[0].value as FakeImage;
  expect(r.ok && r.image).toBe(baked);
  expect(baked.dispose).not.toHaveBeenCalled();
  expect(converted.dispose).toHaveBeenCalledTimes(1);

  converted = image(1080, 1920);
  const a = cropFrameToGuide(frame('up'), null, 'android', false);
  expect(a.ok && a.image).toBe(converted);
  expect(converted.dispose).not.toHaveBeenCalled();

  converted = image(1080, 1920);
  const b = cropFrameToGuide(frame('left'), null, 'android', false);
  const corrected = converted.rotate.mock.results[0].value as FakeImage;
  expect(b.ok && b.image).toBe(corrected);
  expect(corrected.dispose).not.toHaveBeenCalled();
  expect(converted.dispose).toHaveBeenCalledTimes(1);
});

test('errors: crop or bake throwing still disposes everything that was made', () => {
  converted.crop = jest.fn(() => {
    throw new Error('crop failed');
  });
  const baked = image(1080, 1920);
  baked.crop = jest.fn(() => {
    throw new Error('crop failed');
  });
  converted.rotate = jest.fn(() => baked);
  const r = cropFrameToGuide(frame('left'), geometry, 'ios', true);
  expect(r).toMatchObject({ ok: false, reason: 'error' });
  expect(baked.dispose).toHaveBeenCalledTimes(1);
  expect(converted.dispose).toHaveBeenCalledTimes(1);

  converted = image(1080, 1920);
  converted.rotate = jest.fn(() => {
    throw new Error('bake failed');
  });
  expect(cropFrameToGuide(frame('left'), geometry, 'ios', true)).toMatchObject({ ok: false, reason: 'error' });
  expect(converted.dispose).toHaveBeenCalledTimes(1);

  converter.convertFrameToImage = jest.fn(() => {
    throw new Error('convert failed');
  });
  expect(cropFrameToGuide(frame('left'), geometry, 'ios', true)).toMatchObject({
    ok: false,
    reason: 'error',
    error: 'Error: convert failed',
  });
});
