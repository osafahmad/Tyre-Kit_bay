import type { SidewallTextDetectOutcome } from './SidewallTextDetector';

// Sidewall empty-frame check (owner request 2026-11-13). When ML Kit read no
// text line in any sidewall frame, the text detector is run over every frame
// too; if it finds no box either, Sidewall captured shows a notice instead of
// silently leaving every field `Not read`.

export type SidewallDetectionCount = {
  detections: number;
  /** Frames the detector could run on. */
  framesRun: number;
  /** The model wasn't available (so it could not contradict the empty OCR). */
  modelMissing: boolean;
};

const isRealFrame = (f: string) => !f.startsWith('demo://');

export async function countSidewallDetections(
  frames: string[],
  detector: { detectFrame(frame: string, index: number): Promise<SidewallTextDetectOutcome> },
  isCancelled: () => boolean = () => false,
): Promise<SidewallDetectionCount> {
  let detections = 0;
  let framesRun = 0;
  let modelMissing = false;
  for (const [i, frame] of frames.filter(isRealFrame).entries()) {
    if (isCancelled()) break;
    const o = await detector.detectFrame(frame, i);
    if (o.status === 'done') {
      framesRun++;
      detections += o.result.detections.length;
    } else if (o.status === 'unavailable' && o.reason === 'model_missing') {
      modelMissing = true;
      break;
    }
  }
  return { detections, framesRun, modelMissing };
}

/**
 * Whether to show the "No tyre sidewall detected" notice: OCR read no line in
 * any frame, and the detector found no box (or could not run at all).
 */
export function sidewallLooksEmpty(linesRead: number, count: SidewallDetectionCount): boolean {
  return linesRead === 0 && count.detections === 0;
}

export const NO_SIDEWALL_NOTICE = "No tyre sidewall detected — point closely at the tyre's sidewall lettering and retake";
