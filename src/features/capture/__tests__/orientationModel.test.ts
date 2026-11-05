import { uprightPlan, type UprightPlan } from '../guideGeometry';

/**
 * Pixel-level model of the native orientation chain, so a 180° (or 90°) error
 * shows up as wrong pixels, not just as a correct width/height.
 *
 * Each native step is modelled from its source or documentation:
 * - VisionCamera Frame.orientation docs: 'left' = pixel data rotated −90°
 *   (scene top on the buffer's left), 'right' = +90°, 'down' = 180°.
 * - iOS converter (HybridFrameConverter + MediaSampleMetadata.uiImageOrientation +
 *   CameraOrientation.toUIImageOrientation): UIImage flag with the SAME name.
 * - UIKit draws a flagged UIImage per EXIF: .right = rotate 90° clockwise to
 *   display (EXIF 6, iPhone portrait photos), .left = 90° counter-clockwise
 *   (EXIF 8), .down = 180°.
 * - Android converter (ImageProxy+toBitmap): Matrix.postRotate(orientation.degrees),
 *   clockwise, with degrees left=270, right=90, down=180.
 * - nitro-image rotate(d, false): iOS redraws (applying the flag) then turns d
 *   clockwise; Android Matrix.setRotate(d), clockwise.
 * - Without a redraw, nitro-image's iOS crop reads the RAW CGImage pixels.
 *
 * What this cannot prove: that the libraries and the phone really behave as
 * modelled (e.g. the real AVFoundation buffer orientation, or a device whose
 * sensor is mounted differently). Only a device test shows that. Mirrored
 * frames aren't modelled (the back camera isn't mirrored).
 */

type Grid = string[];
const SCENE: Grid = ['ABC', 'DEF']; // what the preview shows, upright

const rotCW = (g: Grid): Grid =>
  Array.from({ length: g[0].length }, (_, c) => g.map(row => row[c]).reverse().join(''));
const rotCCW = (g: Grid): Grid =>
  Array.from({ length: g[0].length }, (_, i) => g.map(row => row[row.length - 1 - i]).join(''));
const rot180 = (g: Grid): Grid => g.map(row => [...row].reverse().join('')).reverse();
const turnCW = (g: Grid, degrees: number): Grid => {
  let out = g;
  for (let k = 0; k < (((degrees % 360) + 360) % 360) / 90; k++) out = rotCW(out);
  return out;
};

type O = 'up' | 'down' | 'left' | 'right';
const ORIENTATIONS: O[] = ['up', 'down', 'left', 'right'];

/** The sensor buffer for a scene, per VisionCamera's documented meaning of `orientation`. */
const bufferFor = (scene: Grid, o: O): Grid =>
  o === 'left' ? rotCCW(scene) : o === 'right' ? rotCW(scene) : o === 'down' ? rot180(scene) : scene;

/** UIKit drawing a UIImage with flag `o` (VisionCamera sets the same-named flag). */
const uikitDraw = (buffer: Grid, flag: O): Grid =>
  flag === 'right' ? rotCW(buffer) : flag === 'left' ? rotCCW(buffer) : flag === 'down' ? rot180(buffer) : buffer;

const ANDROID_DEGREES: Record<O, number> = { up: 0, right: 90, down: 180, left: 270 };

/** Pixels that reach crop/JPEG for a given plan. */
function pixelsAfter(platform: 'ios' | 'android', o: O, plan: { redraw: boolean; degrees: number }): Grid {
  const buffer = bufferFor(SCENE, o);
  if (platform === 'ios') {
    return plan.redraw ? turnCW(uikitDraw(buffer, o), plan.degrees) : buffer; // no redraw: raw CGImage
  }
  const bitmap = turnCW(buffer, ANDROID_DEGREES[o]);
  return plan.redraw ? turnCW(bitmap, plan.degrees) : bitmap;
}

const fromPlan = (p: UprightPlan) => ({ redraw: p.redraw, degrees: p.correctionDegrees });

describe('the model reproduces both device observations (so it can be trusted for the fix)', () => {
  test('before the first fix (rotate by orientation on top of the flag): sideways on iPhone, phone upright', () => {
    const oldRotation: Record<O, number> = { up: 0, right: -90, left: 90, down: 180 };
    const out = pixelsAfter('ios', 'left', { redraw: true, degrees: oldRotation.left });
    expect(out).toHaveLength(3); // 3 rows of 2: landscape where the scene is portrait = sideways
  });

  test('after the first fix (redraw with no correction): upside down for left/right, fine for up/down', () => {
    for (const o of ORIENTATIONS) {
      const out = pixelsAfter('ios', o, { redraw: true, degrees: 0 });
      expect(out).toEqual(o === 'left' || o === 'right' ? rot180(SCENE) : SCENE);
    }
  });
});

describe('with uprightPlan the pixels match the preview, every orientation', () => {
  test.each(ORIENTATIONS)('iOS %s', o => {
    expect(pixelsAfter('ios', o, fromPlan(uprightPlan('ios', o, false)))).toEqual(SCENE);
  });

  test.each(ORIENTATIONS)('Android %s (same converter error per source; unverified on a device)', o => {
    expect(pixelsAfter('android', o, fromPlan(uprightPlan('android', o, false)))).toEqual(SCENE);
  });

  test('Android library alone is also 180° off for left/right', () => {
    expect(pixelsAfter('android', 'left', { redraw: false, degrees: 0 })).toEqual(rot180(SCENE));
    expect(pixelsAfter('android', 'right', { redraw: false, degrees: 0 })).toEqual(rot180(SCENE));
  });

  test('iOS up without a redraw is right (raw pixels are already upright)', () => {
    expect(pixelsAfter('ios', 'up', { redraw: false, degrees: 0 })).toEqual(SCENE);
  });
});
