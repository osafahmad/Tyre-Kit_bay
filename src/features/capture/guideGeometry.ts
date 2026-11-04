import type { CameraOrientation } from 'react-native-vision-camera';

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/**
 * Degrees (clockwise) to turn a frame so it's upright, given VisionCamera's
 * `frame.orientation` (how the pixel data is rotated relative to upright).
 */
export function uprightRotation(orientation: CameraOrientation): number {
  'worklet';
  switch (orientation) {
    case 'right':
      return -90;
    case 'left':
      return 90;
    case 'down':
      return 180;
    default:
      return 0;
  }
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
