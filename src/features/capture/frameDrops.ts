import type { FrameDroppedReason } from 'react-native-vision-camera';

// Frame outputs use `dropFramesWhileBusy: true`: while the camera-thread
// worklet is still working on one frame, the camera skips the next ones and
// reports them as dropped (`frame-was-late`). That is the intended behaviour,
// not an error. Without an `onFrameDropped` handler VisionCamera calls
// `console.warn` for every drop, which floods LogBox during capture and costs
// JS-thread time. These handlers only count them, per camera output.
//
// `out-of-buffers` is different: the camera's buffer pool was empty because
// buffers were still held somewhere. Every worklet disposes its frame in
// `finally`, so it should not happen; if it does, development builds warn once
// per output, with the counts so far, so a device run shows which output it was.

/** Which frame output dropped the frame. */
export type FrameDropSource = 'tyre-capture' | 'text-scanner';

type Counts = Record<FrameDroppedReason, number>;

const emptyCounts = (): Counts => ({
  'frame-was-late': 0,
  'out-of-buffers': 0,
  discontinuity: 0,
  unknown: 0,
});

const counts: Record<FrameDropSource, Counts> = {
  'tyre-capture': emptyCounts(),
  'text-scanner': emptyCounts(),
};
const warned = new Set<FrameDropSource>();

/** Records one dropped frame. No logging for expected drops. */
export function recordFrameDrop(
  source: FrameDropSource,
  reason: FrameDroppedReason,
  isDev: boolean = __DEV__,
): void {
  const c = counts[source];
  c[reason] = (c[reason] ?? 0) + 1;
  if (reason === 'out-of-buffers' && isDev && !warned.has(source)) {
    warned.add(source);
    console.warn(
      `Camera ran out of frame buffers (${source}): a frame or plane may still be held.`,
      JSON.stringify(c),
    );
  }
}

/** `onFrameDropped` for one `useFrameOutput`. */
export function frameDropHandler(source: FrameDropSource): (reason: FrameDroppedReason) => void {
  return reason => recordFrameDrop(source, reason);
}

/** Dropped frames so far for one output, by reason (diagnostics and tests). */
export function frameDropCounts(source: FrameDropSource): Readonly<Counts> {
  return { ...counts[source] };
}

/** Tests only. */
export function resetFrameDropCounts(): void {
  for (const k of Object.keys(counts) as FrameDropSource[]) counts[k] = emptyCounts();
  warned.clear();
}
