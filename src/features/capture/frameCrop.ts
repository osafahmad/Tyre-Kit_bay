import { HybridFrameConverter, type Frame } from 'react-native-vision-camera';
import type { Image } from 'react-native-nitro-image';
import { guideToImageRect, uprightPlan, type Rect, type Size } from './guideGeometry';

export type GuideGeometry = { guide: Rect; view: Size; margin: number };

/** What happened to one frame: sizes, the correction applied, and the crop rect. */
export type CropInfo = {
  frameWidth: number;
  frameHeight: number;
  orientation: string;
  isMirrored: boolean;
  /** Size the converted image reports (on iOS UIImage.size, which already honours its flag). */
  convertedWidth: number;
  convertedHeight: number;
  /** True when the converted image was redrawn (`rotate(correctionDegrees, false)`). */
  redrawn: boolean;
  /** Correction for the converter's 180° error (see `uprightPlan`). */
  correctionDegrees: number;
  uprightWidth: number;
  uprightHeight: number;
  rect: Rect | null;
};

export type FrameCrop =
  | { ok: true; image: Image; info: CropInfo }
  | { ok: false; reason: 'no_rect' | 'error'; error?: string; info: CropInfo };

/**
 * Camera thread: frame → upright image (converter, plus `uprightPlan`'s correction in one redraw)
 * → crop to the guide box as drawn on the `cover` preview.
 *
 * The returned `image` belongs to the caller, who must dispose it. Every other
 * image made here (converted, baked) is disposed on every path, errors included.
 * The frame itself is not disposed here; the caller's `finally` does that.
 *
 * `requireRect: false` (tyre capture) returns the whole upright image when
 * there's no guide yet; `true` (OCR) reports `no_rect` instead.
 */
export function cropFrameToGuide(
  frame: Frame,
  geometry: GuideGeometry | null,
  platform: string,
  requireRect: boolean,
): FrameCrop {
  'worklet';
  const info: CropInfo = {
    frameWidth: frame.width,
    frameHeight: frame.height,
    orientation: String(frame.orientation),
    isMirrored: frame.isMirrored,
    convertedWidth: 0,
    convertedHeight: 0,
    redrawn: false,
    correctionDegrees: 0,
    uprightWidth: 0,
    uprightHeight: 0,
    rect: null,
  };
  let converted: Image | null = null;
  let baked: Image | null = null;
  try {
    converted = HybridFrameConverter.convertFrameToImage(frame);
    info.convertedWidth = converted.width;
    info.convertedHeight = converted.height;

    const plan = uprightPlan(platform, frame.orientation, frame.isMirrored);
    info.redrawn = plan.redraw;
    info.correctionDegrees = plan.correctionDegrees;
    // One redraw: honours the converter's flag (iOS), then adds the correction.
    // allowFastFlagRotation=false forces real pixels instead of a new flag.
    if (plan.redraw) baked = converted.rotate(plan.correctionDegrees, false);
    const upright: Image = baked ?? converted;
    info.uprightWidth = upright.width;
    info.uprightHeight = upright.height;

    const rect = geometry
      ? guideToImageRect(
          geometry.guide,
          geometry.view,
          { width: upright.width, height: upright.height },
          geometry.margin,
        )
      : null;
    info.rect = rect;

    if (rect === null) {
      if (requireRect) return { ok: false, reason: 'no_rect', info };
      // Hand the whole upright image over; it must not be disposed below.
      if (upright === baked) baked = null;
      else converted = null;
      return { ok: true, image: upright, info };
    }
    const cropped = upright.crop(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    return { ok: true, image: cropped, info };
  } catch (e) {
    return { ok: false, reason: 'error', error: String(e), info };
  } finally {
    if (baked) baked.dispose();
    if (converted) converted.dispose();
  }
}
