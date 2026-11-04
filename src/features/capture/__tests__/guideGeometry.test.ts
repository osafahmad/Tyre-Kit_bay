import { guideToImageRect, uprightRotation } from '../guideGeometry';

test('upright rotation counters the frame orientation', () => {
  expect(uprightRotation('up')).toBe(0);
  expect(uprightRotation('right')).toBe(-90);
  expect(uprightRotation('left')).toBe(90);
  expect(uprightRotation('down')).toBe(180);
});

test('maps the guide through a cover-scaled preview', () => {
  // 720x1280 image filling a 360x400 view: scale 0.5, image shown 360x640, 120pt cut top and bottom.
  const rect = guideToImageRect(
    { x: 50, y: 157, width: 260, height: 86 },
    { width: 360, height: 400 },
    { width: 720, height: 1280 },
    0,
  );
  expect(rect).toEqual({ x: 100, y: 554, width: 520, height: 172 });
});

test('adds a margin and clamps to the image', () => {
  const rect = guideToImageRect(
    { x: 0, y: 0, width: 360, height: 100 },
    { width: 360, height: 640 },
    { width: 720, height: 1280 },
    0.1,
  );
  expect(rect).toEqual({ x: 0, y: 0, width: 720, height: 220 });
});

test('no usable rect before layout', () => {
  expect(
    guideToImageRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }, { width: 720, height: 1280 }, 0),
  ).toBeNull();
});
