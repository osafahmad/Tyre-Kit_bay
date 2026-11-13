import { sidewallCropConfig } from '../../config/capture';
import { deleteCropFiles, type SidewallCropResult, type SidewallTextDetectOutcome, type SidewallTextFrameResult, type SidewallCropsOutcome } from './SidewallTextDetector';
import { sidewallDetectorLog } from './sidewallDetectorDebug';
import { spreadIndexes } from './treadPresence';

// Stage 3 (owner request 2026-11-13): the detector + crop OCR pass that feeds
// Sidewall captured. Runs on a few saved sidewall frames spread over the scan
// (4 ML Kit runs per box, so not on every frame), after the whole-frame read.

export type SidewallCropPass = {
  /** Crops of each frame that ran, in frame order. */
  frames: SidewallCropResult[][];
  /** Frames the detector ran on. */
  framesRun: number;
  /** Boxes found over those frames, ignored ones included. */
  detections: number;
  /** Real (not simulated) frames in the scan. */
  realFrames: number;
  modelMissing: boolean;
};

export type CropPassDetector = {
  detectFrame(frame: string, index: number): Promise<SidewallTextDetectOutcome>;
  readCrops(result: SidewallTextFrameResult, frameIndex: number): Promise<SidewallCropsOutcome>;
};

const isRealFrame = (f: string) => !f.startsWith('demo://');

/**
 * Detector boxes → crop OCR on up to `maxFrames` frames. Never throws. Stops
 * at the first sign the model is missing. Crop thumbnails are deleted at once
 * (only the staging card shows them, and it makes its own).
 */
export async function readSidewallCrops(
  frames: string[],
  detector: CropPassDetector,
  options: { isCancelled?: () => boolean; deleteFile: (path: string) => Promise<void>; maxFrames?: number },
): Promise<SidewallCropPass> {
  const isCancelled = options.isCancelled ?? (() => false);
  const real = frames.filter(isRealFrame);
  const picked = spreadIndexes(real.length, options.maxFrames ?? sidewallCropConfig.maxFrames);
  const pass: SidewallCropPass = { frames: [], framesRun: 0, detections: 0, realFrames: real.length, modelMissing: false };
  const started = Date.now();
  for (const i of picked) {
    if (isCancelled()) break;
    try {
      const o = await detector.detectFrame(real[i], i);
      if (o.status === 'unavailable' && o.reason === 'model_missing') {
        pass.modelMissing = true;
        break;
      }
      if (o.status !== 'done') continue;
      pass.framesRun++;
      pass.detections += o.result.detections.length;
      if (o.result.detections.length === 0 || isCancelled()) continue;
      const c = await detector.readCrops(o.result, i);
      if (c.status !== 'done') continue;
      await deleteCropFiles(c.crops, options.deleteFile);
      pass.frames.push(c.crops);
    } catch (e) {
      sidewallDetectorLog(`crop pass: frame ${i + 1} failed`, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  const crops = pass.frames.flat();
  sidewallDetectorLog('crop pass done', {
    ms: Date.now() - started,
    frames: picked.map(i => i + 1),
    framesRun: pass.framesRun,
    detections: pass.detections,
    used: crops.filter(c => !c.ignored).length,
    ignoredNoText: crops.filter(c => c.ignored === 'no_text').length,
    ignoredOverlap: crops.filter(c => c.ignored === 'overlap').length,
    modelMissing: pass.modelMissing,
  });
  return pass;
}

/** Whether the pass looked at every real frame, so its count can stand in for a full detector sweep. */
export function cropPassCoveredAllFrames(pass: SidewallCropPass): boolean {
  return pass.modelMissing || pass.framesRun >= pass.realFrames;
}
