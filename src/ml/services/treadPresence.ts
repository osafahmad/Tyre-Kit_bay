import { treadPresenceConfig } from '../../config/capture';
import { absoluteFramePath } from '../../features/capture/frameFiles';
import { localFramePath, type PipelineDeps } from '../inference/pipeline';
import { pixelLayout, type DecodableImage, type ImageDecoder } from '../inference/tensorUtils';
import type { RawPixels } from '../inference/types';
import { r3, treadLog } from './treadDebug';

// Tyre & tread presence check (owner request 2026-11-13). Before a tread
// result is shown, the saved tread frames are checked for two things real
// tread has and a wall, floor or ceiling doesn't: low-saturation dark-to-mid
// rubber, and strong repeated groove edges. No model: plain pixel statistics
// on the saved JPEGs, with thresholds in `treadPresenceConfig` (UNCALIBRATED).
// It can only block a result, never improve one.

/** The thresholds, as plain numbers so tests and later calibration can pass variants. */
export type TreadPresenceConfig = { readonly [K in keyof typeof treadPresenceConfig]: number };

export type TreadPresenceReason = 'ok' | 'too_smooth_no_grooves' | 'not_rubber_surface' | 'insufficient_frames';

/** Pixel statistics of one frame, all from its luminance and RGB spread. */
export type TreadFrameMetrics = {
  width: number;
  height: number;
  /** Median luminance 0–255 (Rec. 601 weights). */
  medianLuminance: number;
  /** Median HSV saturation 0–1 ((max − min) / max per pixel). */
  medianSaturation: number;
  /** Fraction of pixels with luminance ≥ 235. */
  blownOutFraction: number;
  /** Mean |ΔL| between horizontal neighbours (across columns) and vertical neighbours (across rows). */
  meanGradientX: number;
  meanGradientY: number;
  /** Fraction of neighbour pairs with |ΔL| ≥ `edgeDelta`, per axis. */
  strongEdgeFractionX: number;
  strongEdgeFractionY: number;
};

export type TreadFrameJudgement = {
  index: number;
  metrics: TreadFrameMetrics;
  rubber: boolean;
  grooves: boolean;
  reason: TreadPresenceReason;
};

export type TreadPresenceVerdict = {
  isTyreTread: boolean;
  /** Fraction of readable frames that looked like tread (0 when too few frames could be read). */
  confidence: number;
  reason: TreadPresenceReason;
  metrics: {
    framesChecked: number;
    framesReadable: number;
    framesPassed: number;
    frames: TreadFrameJudgement[];
    /** Frames that couldn't be decoded, by index. */
    unreadable: number[];
  };
};

/** Pixel statistics of a decoded frame (see `TreadFrameMetrics`). */
export function treadPresenceMetrics(pixels: RawPixels, edgeDelta: number = treadPresenceConfig.edgeDelta): TreadFrameMetrics {
  const layout = pixelLayout(pixels.pixelFormat);
  if (!layout) throw new Error(`Unsupported pixel format: ${pixels.pixelFormat}`);
  const { width: w, height: h } = pixels;
  const rowBytes = pixels.buffer.byteLength / h;
  if (!Number.isInteger(rowBytes) || rowBytes < w * layout.bytesPerPixel) {
    throw new Error('Pixel buffer size does not match its width and height.');
  }
  const src = new Uint8Array(pixels.buffer);
  const lum = new Float32Array(w * h);
  const lumHist = new Uint32Array(256);
  const satHist = new Uint32Array(101);
  let blown = 0;
  for (let y = 0; y < h; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < w; x++) {
      const p = row + x * layout.bytesPerPixel;
      const r = src[p + layout.r];
      const g = src[p + layout.g];
      const b = src[p + layout.b];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[y * w + x] = l;
      lumHist[Math.min(255, Math.round(l))]++;
      if (l >= 235) blown++;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const s = max === 0 ? 0 : (max - min) / max;
      satHist[Math.round(s * 100)]++;
    }
  }
  const n = w * h;
  const median = (hist: Uint32Array, scale: number) => {
    let seen = 0;
    for (let i = 0; i < hist.length; i++) {
      seen += hist[i];
      if (seen * 2 >= n) return i / scale;
    }
    return (hist.length - 1) / scale;
  };
  let sumX = 0;
  let strongX = 0;
  let pairsX = 0;
  let sumY = 0;
  let strongY = 0;
  let pairsY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w) {
        const d = Math.abs(lum[i + 1] - lum[i]);
        sumX += d;
        if (d >= edgeDelta) strongX++;
        pairsX++;
      }
      if (y + 1 < h) {
        const d = Math.abs(lum[i + w] - lum[i]);
        sumY += d;
        if (d >= edgeDelta) strongY++;
        pairsY++;
      }
    }
  }
  return {
    width: w,
    height: h,
    medianLuminance: median(lumHist, 1),
    medianSaturation: median(satHist, 100),
    blownOutFraction: blown / n,
    meanGradientX: pairsX ? sumX / pairsX : 0,
    meanGradientY: pairsY ? sumY / pairsY : 0,
    strongEdgeFractionX: pairsX ? strongX / pairsX : 0,
    strongEdgeFractionY: pairsY ? strongY / pairsY : 0,
  };
}

/** One frame's metrics against the thresholds. */
export function judgeTreadFrame(
  index: number,
  metrics: TreadFrameMetrics,
  cfg: TreadPresenceConfig = treadPresenceConfig,
): TreadFrameJudgement {
  const rubber =
    metrics.medianLuminance >= cfg.minMedianLuminance &&
    metrics.medianLuminance <= cfg.maxMedianLuminance &&
    metrics.medianSaturation <= cfg.maxMedianSaturation &&
    metrics.blownOutFraction <= cfg.maxBlownOutFraction;
  // Grooves run one way across the frame, so the stronger axis is the one that matters.
  const grooves =
    Math.max(metrics.strongEdgeFractionX, metrics.strongEdgeFractionY) >= cfg.minStrongEdgeFraction &&
    Math.max(metrics.meanGradientX, metrics.meanGradientY) >= cfg.minMeanGradient;
  const reason: TreadPresenceReason = !rubber ? 'not_rubber_surface' : !grooves ? 'too_smooth_no_grooves' : 'ok';
  return { index, metrics, rubber, grooves, reason };
}

/** Per-frame judgements → the scan's verdict. */
export function combineTreadJudgements(
  frames: TreadFrameJudgement[],
  unreadable: number[],
  cfg: TreadPresenceConfig = treadPresenceConfig,
): TreadPresenceVerdict {
  const readable = frames.length;
  const passed = frames.filter(f => f.reason === 'ok').length;
  const metrics = { framesChecked: readable + unreadable.length, framesReadable: readable, framesPassed: passed, frames, unreadable };
  if (readable < cfg.minFrames) {
    return { isTyreTread: false, confidence: 0, reason: 'insufficient_frames', metrics };
  }
  const confidence = passed / readable;
  if (confidence >= cfg.minPassFraction) return { isTyreTread: true, confidence, reason: 'ok', metrics };
  // The most common failure names the problem; rubber failures first on a tie (they are the clearer sign).
  const counts = { not_rubber_surface: 0, too_smooth_no_grooves: 0 };
  for (const f of frames) if (f.reason !== 'ok' && f.reason !== 'insufficient_frames') counts[f.reason]++;
  const reason: TreadPresenceReason =
    counts.not_rubber_surface >= counts.too_smooth_no_grooves ? 'not_rubber_surface' : 'too_smooth_no_grooves';
  return { isTyreTread: false, confidence, reason, metrics };
}

/** `count` indexes spread evenly over `total` frames (all of them when there are few). */
export function spreadIndexes(total: number, count: number): number[] {
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  return Array.from({ length: count }, (_, k) => Math.round((k * (total - 1)) / (count - 1)));
}

/** A verdict that blocks a result: positive evidence of no tread, not merely unreadable frames. */
export function blocksTreadResult(verdict: TreadPresenceVerdict): boolean {
  return !verdict.isTyreTread && verdict.reason !== 'insufficient_frames';
}

export interface TreadPresenceChecker {
  validate(frames: string[], isCancelled?: () => boolean): Promise<TreadPresenceVerdict>;
}

export type TreadPresenceDeps = {
  pipeline: PipelineDeps;
  config?: TreadPresenceConfig;
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isRealFrame = (f: string) => !f.startsWith('demo://');

const round = (m: TreadFrameMetrics) => ({
  size: [m.width, m.height],
  medianLum: r3(m.medianLuminance),
  medianSat: r3(m.medianSaturation),
  blownOut: r3(m.blownOutFraction),
  gradX: r3(m.meanGradientX),
  gradY: r3(m.meanGradientY),
  edgesX: r3(m.strongEdgeFractionX),
  edgesY: r3(m.strongEdgeFractionY),
});

export class TreadPresenceValidator implements TreadPresenceChecker {
  constructor(private readonly deps: TreadPresenceDeps) {}

  /** One frame's metrics. Every decoded image is disposed. Throws if the frame can't be read. */
  async frameMetrics(frame: string): Promise<TreadFrameMetrics> {
    const cfg = this.deps.config ?? treadPresenceConfig;
    const images: DecodableImage[] = [];
    try {
      let image = await this.deps.pipeline.decoder.loadFromFileAsync(localFramePath(frame, this.deps.pipeline));
      images.push(image);
      if (image.width > cfg.analysisWidth) {
        const h = Math.max(1, Math.round((image.height * cfg.analysisWidth) / image.width));
        image = await image.resizeAsync(cfg.analysisWidth, h);
        images.push(image);
      }
      return treadPresenceMetrics(await image.toRawPixelDataAsync(), cfg.edgeDelta);
    } finally {
      for (const img of images) {
        try {
          img.dispose();
        } catch {
          // Already released.
        }
      }
    }
  }

  /**
   * Up to `maxFramesChecked` saved frames, spread over the scan. Never throws:
   * an unreadable frame is counted, and too few readable frames is its own
   * reason (which does not block a result). Logged as `[TreadWear] presence:`.
   */
  async validate(frames: string[], isCancelled: () => boolean = () => false): Promise<TreadPresenceVerdict> {
    const cfg = this.deps.config ?? treadPresenceConfig;
    const real = frames.filter(isRealFrame);
    const picked = spreadIndexes(real.length, cfg.maxFramesChecked);
    const started = Date.now();
    const judged: TreadFrameJudgement[] = [];
    const unreadable: number[] = [];
    for (const i of picked) {
      if (isCancelled()) break;
      try {
        judged.push(judgeTreadFrame(i, await this.frameMetrics(real[i]), cfg));
      } catch (e) {
        unreadable.push(i);
        treadLog(`presence: frame ${i + 1} unreadable`, { error: errorText(e) });
      }
    }
    const verdict = combineTreadJudgements(judged, unreadable, cfg);
    treadLog(`presence: ${verdict.reason} (tread ${verdict.isTyreTread}, confidence ${r3(verdict.confidence)})`, {
      ms: Date.now() - started,
      savedFrames: frames.length,
      checked: picked.map(i => i + 1),
      passed: verdict.metrics.framesPassed,
      unreadable: unreadable.map(i => i + 1),
      frames: judged.map(f => ({ frame: f.index + 1, reason: f.reason, ...round(f.metrics) })),
      thresholds: cfg,
    });
    return verdict;
  }
}

function nitroDecoder(): ImageDecoder {
  // Loaded lazily so tests and builds without the module don't touch native code.
  const { Images } = require('react-native-nitro-image') as typeof import('react-native-nitro-image');
  return Images as unknown as ImageDecoder;
}

let instance: TreadPresenceValidator | null = null;

/** One validator for the app. */
export function getTreadPresenceValidator(): TreadPresenceValidator {
  instance ??= new TreadPresenceValidator({
    pipeline: {
      resolveFramePath: absoluteFramePath,
      get decoder(): ImageDecoder {
        return nitroDecoder();
      },
    },
  });
  return instance;
}
