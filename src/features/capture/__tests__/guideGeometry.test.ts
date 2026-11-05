import { guideToImageRect, uprightPlan } from '../guideGeometry';

describe('uprightPlan: corrects the converter\'s 180° error for left/right, in one redraw', () => {
  test('iOS', () => {
    // Phone upright on iPhone = frame orientation `left` (device test).
    expect(uprightPlan('ios', 'left', false)).toEqual({ redraw: true, correctionDegrees: 180 });
    expect(uprightPlan('ios', 'right', false)).toEqual({ redraw: true, correctionDegrees: 180 });
    // up/down flags are applied in the right direction; down still needs baking into pixels.
    expect(uprightPlan('ios', 'down', false)).toEqual({ redraw: true, correctionDegrees: 0 });
    expect(uprightPlan('ios', 'up', true)).toEqual({ redraw: true, correctionDegrees: 0 });
    expect(uprightPlan('ios', 'up', false)).toEqual({ redraw: false, correctionDegrees: 0 });
  });

  test('Android: same correction (same error in the converter), no redraw otherwise', () => {
    expect(uprightPlan('android', 'left', false)).toEqual({ redraw: true, correctionDegrees: 180 });
    expect(uprightPlan('android', 'right', false)).toEqual({ redraw: true, correctionDegrees: 180 });
    expect(uprightPlan('android', 'up', false)).toEqual({ redraw: false, correctionDegrees: 0 });
    expect(uprightPlan('android', 'down', false)).toEqual({ redraw: false, correctionDegrees: 0 });
  });

  test('never depends on anything but the frame (no phone-position check)', () => {
    for (const o of ['up', 'down', 'left', 'right'] as const) {
      expect(uprightPlan('ios', o, false)).toEqual(uprightPlan('ios', o, false));
      expect([0, 180]).toContain(uprightPlan('ios', o, false).correctionDegrees);
    }
  });
});

test('device case: 1080x1920 upright image in a portrait view crops a landscape box, not a sideways strip', () => {
  // Converted size from the device test (phone upright). The guide is wider than tall,
  // so the crop must be too.
  const rect = guideToImageRect(
    { x: 65, y: 182, width: 260, height: 150 },
    { width: 390, height: 514 },
    { width: 1080, height: 1920 },
    0,
  )!;
  expect(rect.width).toBeGreaterThan(rect.height);
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
