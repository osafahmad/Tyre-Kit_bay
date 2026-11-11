import type { FrameDroppedReason } from 'react-native-vision-camera';

// Frame outputs use `dropFramesWhileBusy: true`: while the camera-thread
// worklet is still working on one frame, the camera skips the next ones and
// reports them as dropped (`frame-was-late`). That is the intended behaviour,
// not an error. Without an `onFrameDropped` handler VisionCamera calls
// `console.warn` for every drop, which floods LogBox during capture and costs
// JS-thread time. This handler only counts them.
//
// `out-of-buffers` is different: it means frames are being held (not
// disposed). That is still reported in development builds, once per reason.

const counts: Record<FrameDroppedReason, number> = {
  'frame-was-late': 0,
  'out-of-buffers': 0,
  discontinuity: 0,
  unknown: 0,
};
const warned = new Set<FrameDroppedReason>();

/** `onFrameDropped` for every `useFrameOutput`. Cheap: no logging for expected drops. */
export function onFrameDropped(reason: FrameDroppedReason, isDev: boolean = __DEV__): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
  if (reason === 'out-of-buffers' && isDev && !warned.has(reason)) {
    warned.add(reason);
    console.warn('Camera ran out of frame buffers: a frame may not have been disposed.');
  }
}

/** Dropped frames so far, by reason (diagnostics and tests). */
export function frameDropCounts(): Readonly<Record<FrameDroppedReason, number>> {
  return { ...counts };
}

/** Tests only. */
export function resetFrameDropCounts(): void {
  for (const k of Object.keys(counts) as FrameDroppedReason[]) counts[k] = 0;
  warned.clear();
}
