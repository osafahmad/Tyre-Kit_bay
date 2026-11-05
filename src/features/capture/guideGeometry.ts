import type { CameraOrientation } from 'react-native-vision-camera';

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/**
 * What to do with the image from `HybridFrameConverter.convertFrameToImage`
 * so its PIXELS are upright and match the preview, before cropping and saving.
 * Done in one `rotate(correctionDegrees, false)` call (a real redraw), or not at all.
 *
 * `frame.orientation` itself is right (VisionCamera docs: `'left'` = pixel data
 * rotated −90°, i.e. the scene's top is on the buffer's left, so it needs 90°
 * clockwise to be upright). The converter applies it in the WRONG direction
 * for `left`/`right` (react-native-vision-camera 5.2.4 source):
 * - iOS: `CameraOrientation.toUIImageOrientation` maps `.left → UIImage .left`
 *   (displayed 90° counter-clockwise). The upright flag for that buffer is
 *   `.right` (displayed 90° clockwise; what iPhone portrait photos use, EXIF 6).
 * - Android: `rotationDegrees` 90 → `fromDegrees` → LEFT → `.degrees` 270 →
 *   `postRotate(270)`, i.e. −rotationDegrees instead of +rotationDegrees.
 * Either way the image is off by exactly 180° for `left`/`right`, and right
 * for `up`/`down`. The phone-upright case is `left` on iOS (device test).
 *
 * The correction is a 180° turn. It commutes with mirroring, so it's also
 * right for mirrored frames. On iOS the redraw also bakes the flag into the
 * pixels (UIGraphicsImageRenderer, orientation `.up`), because nitro-image's
 * `crop` reads raw CGImage pixels and the JPEG must not depend on an EXIF tag.
 */
export type UprightPlan = {
  /** Call `rotate(correctionDegrees, false)` on the converted image. */
  redraw: boolean;
  /** Turn added after the converter's own rotation: 180 for left/right, else 0. */
  correctionDegrees: 0 | 180;
};

export function uprightPlan(
  platform: string,
  orientation: CameraOrientation,
  isMirrored: boolean,
): UprightPlan {
  'worklet';
  const correctionDegrees = orientation === 'left' || orientation === 'right' ? 180 : 0;
  // iOS must also redraw whenever the UIImage carries a non-up flag.
  const iosFlag = platform === 'ios' && (orientation !== 'up' || isMirrored);
  return { redraw: correctionDegrees !== 0 || iosFlag, correctionDegrees };
}

/**
 * Maps the guide box drawn over the preview to pixel coordinates in the
 * upright camera image. The preview uses `resizeMode="cover"`, so the image is
 * scaled to fill the view and centred, with the overflow cropped. Adds a
 * margin around the guide and clamps to the image.
 */
export function guideToImageRect(
  guide: Rect,
  view: Size,
  image: Size,
  margin: number,
): Rect | null {
  'worklet';
  if (view.width <= 0 || view.height <= 0 || image.width <= 0 || image.height <= 0) return null;
  const scale = Math.max(view.width / image.width, view.height / image.height);
  const offsetX = (view.width - image.width * scale) / 2;
  const offsetY = (view.height - image.height * scale) / 2;
  const mx = guide.width * margin;
  const my = guide.height * margin;
  const x0 = Math.max(0, (guide.x - mx - offsetX) / scale);
  const y0 = Math.max(0, (guide.y - my - offsetY) / scale);
  const x1 = Math.min(image.width, (guide.x + guide.width + mx - offsetX) / scale);
  const y1 = Math.min(image.height, (guide.y + guide.height + my - offsetY) / scale);
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  return {
    x: Math.round(x0),
    y: Math.round(y0),
    width: Math.round(x1 - x0),
    height: Math.round(y1 - y0),
  };
}
