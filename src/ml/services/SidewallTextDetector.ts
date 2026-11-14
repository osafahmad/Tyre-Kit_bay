import { absoluteFramePath } from '../../features/capture/frameFiles';
import { defaultModelLoaderDeps, loadModel, type ModelLoaderDeps } from '../inference/modelLoader';
import { localFramePath, type PipelineDeps } from '../inference/pipeline';
import { imageFileToModelInput, tensorSpecFromManifest, type ImageDecoder } from '../inference/tensorUtils';
import type { Detection, LetterboxInfo, LoadedModel, ModelDelegate, ModelLoadFailure, PixelRect, TensorInfo } from '../inference/types';
import {
  decodeYoloxOutput,
  detectionToFrameRect,
  inferBoxFormat,
  yoloxOutputStats,
  type YoloxBoxFormat,
  type YoloxDecodeOptions,
  type YoloxOutputStats,
} from '../inference/yolox';
import { modelManifest, type ModelManifest, type YoloxDetectorManifestEntry } from '../manifest';
import { ocrConfig } from '../../config/capture';
import { isOcrAvailable, recognizeLines } from '../ocr/ocr';
import type { OcrLineLike } from '../ocr/textCandidates';
import {
  bestCropRead,
  cropMarginForFrame,
  cropRead,
  CROP_ROTATIONS,
  judgeCrops,
  paddedCropRect,
  type CropIgnoredReason,
  type CropRead,
  type CropRect,
  type CropRotation,
} from './sidewallCropOcr';
import { sidewallDetectorLog } from './sidewallDetectorDebug';

// Runs the YOLOX-Nano sidewall text detector on one saved sidewall frame,
// after capture only (owner task 2026-11-14; it replaced the YOLO11n-seg
// model of 2026-11-13). Stage 1: boxes, scores, timings and raw tensor ranges
// for the `[SidewallDetector]` log. Stage 2: each box is cropped from the
// saved frame, axis-aligned with a small pixel margin, and read by ML Kit in
// four orientations (`readCrops`). Nothing here fills a sidewall field;
// connecting the crop text to the fields is Stage 3 (`sidewallCropMerge.ts`).

export type SidewallTextDetection = Detection & {
  /** The box in the saved frame's pixels (letterbox undone), or null if it lies in the padding. */
  frameRect: PixelRect | null;
};

export type SidewallTextFrameResult = {
  frame: string;
  /** The saved frame's size. */
  source: { width: number; height: number };
  letterbox: LetterboxInfo | null;
  detections: SidewallTextDetection[];
  timings: { decodeMs: number; inferenceMs: number; postMs: number };
  stats: YoloxOutputStats;
  /** The format the boxes were decoded with, and whether the raw range disagreed with the manifest. */
  boxFormat: { used: YoloxBoxFormat; manifest: YoloxBoxFormat; inferred: YoloxBoxFormat | null; overridden: boolean };
  thresholds: { confidence: number; iou: number; maxDetections: number };
  tensors: { inputs: TensorInfo[]; outputs: TensorInfo[] };
  delegate: ModelDelegate | 'cpu';
  modelVersion: string;
  loadMs: number | null;
};

export type SidewallTextDetectOutcome =
  | { status: 'unavailable'; reason: 'model_missing' | 'not_a_file'; detail: string }
  | { status: 'failed'; error: string }
  | { status: 'done'; result: SidewallTextFrameResult };

/** Stage 2: one detector box read by ML Kit in every orientation. */
export type SidewallCropResult = {
  /** Index into `SidewallTextFrameResult.detections`. */
  detection: number;
  label: string;
  score: number;
  /** The padded crop, in saved-frame pixels. */
  crop: CropRect;
  /** Temporary JPEG of the 0° crop, for the card's thumbnail. Delete it with `deleteCropFiles`. */
  thumbnailPath: string | null;
  /** One read per orientation that could be run; a failed orientation is left out. */
  reads: CropRead[];
  /** The read whose text fits the box's class best, or null when no orientation ran. */
  best: CropRead | null;
  ocrMs: number;
  /** Stage 3: some orientation read a letter or digit. */
  verified: boolean;
  /** Stage 3: why this box is left out of the field suggestions (`judgeCrops`), or null when it is used. */
  ignored: CropIgnoredReason | null;
  /** For `overlap`: the `detection` index of the strongly verified box that won. */
  overlappedBy: number | null;
};

export type SidewallCropsOutcome =
  | { status: 'unavailable'; reason: 'ocr_missing' | 'no_detections' }
  | { status: 'done'; crops: SidewallCropResult[] };

/** The native image and OCR calls Stage 2 needs. Injected so tests don't touch native code. */
export type SidewallCropOcrDeps = {
  ocrAvailable(): boolean;
  /**
   * Writes the `rect` part of the image at `path`, turned by `rotation`
   * (90 = clockwise, as nitro-image), to a temporary JPEG and returns its path.
   */
  cropToTempFile(path: string, rect: CropRect, rotation: CropRotation): Promise<string>;
  recognizeLines(path: string): Promise<OcrLineLike[]>;
  deleteFile(path: string): Promise<void>;
  now(): Date;
};

export type SidewallTextDetectorDeps = {
  /** The model, or the load failure. */
  loadModel(): Promise<
    { ok: true; model: LoadedModel<YoloxDetectorManifestEntry> } | { ok: false; failure: ModelLoadFailure }
  >;
  pipeline: PipelineDeps;
  /** Stage 2 crop OCR. Without it `readCrops` reports `ocr_missing`. */
  ocr?: SidewallCropOcrDeps;
  now?: () => number;
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class SidewallTextDetector {
  private model: Promise<LoadedModel<YoloxDetectorManifestEntry> | null> | null = null;
  private lastFailure: ModelLoadFailure | null = null;
  private loadMs: number | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: SidewallTextDetectorDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Why the last load failed, for the staging readout. */
  loadFailure(): ModelLoadFailure | null {
    return this.lastFailure;
  }

  /** Loads the model once. A failed load is retried on the next call. */
  async load(): Promise<LoadedModel<YoloxDetectorManifestEntry> | null> {
    const fresh = this.model === null;
    const started = this.now();
    if (fresh) sidewallDetectorLog('model load started');
    this.model ??= this.deps
      .loadModel()
      .then(r => {
        if (r.ok) {
          this.lastFailure = null;
          return r.model;
        }
        this.lastFailure = r.failure;
        return null;
      })
      .catch(e => {
        this.lastFailure = { key: 'sidewallText', reason: 'load_failed', detail: errorText(e) };
        sidewallDetectorLog('model load threw', { error: errorText(e) });
        return null;
      });
    const loaded = await this.model;
    if (!loaded) {
      this.model = null;
      sidewallDetectorLog('model NOT loaded', { ms: this.now() - started, failure: this.lastFailure });
      return null;
    }
    if (fresh) {
      this.loadMs = this.now() - started;
      sidewallDetectorLog(`model loaded (delegate ${loaded.delegate})`, {
        ms: this.loadMs,
        version: loaded.entry.version,
        inputs: loaded.model.inputs,
        outputs: loaded.model.outputs,
        thresholds: {
          confidence: loaded.entry.confidenceThreshold,
          iou: loaded.entry.iouThreshold,
          maxDetections: loaded.entry.maxDetections,
        },
      });
    }
    return loaded;
  }

  /**
   * One saved frame → text boxes. Never throws: a missing model, a frame that
   * isn't a file, or a decode / run failure comes back as its own outcome.
   */
  async detectFrame(
    frame: string,
    frameIndex: number,
    options: YoloxDecodeOptions = {},
  ): Promise<SidewallTextDetectOutcome> {
    const label = `frame ${frameIndex + 1}`;
    let path: string;
    try {
      path = localFramePath(frame, this.deps.pipeline);
    } catch (e) {
      sidewallDetectorLog(`${label}: not a local file`, { error: errorText(e) });
      return { status: 'unavailable', reason: 'not_a_file', detail: errorText(e) };
    }
    const loaded = await this.load();
    if (!loaded) {
      const f = this.lastFailure;
      return {
        status: 'unavailable',
        reason: 'model_missing',
        detail: f ? `${f.reason}: ${f.detail}` : 'model did not load',
      };
    }
    const { entry, model } = loaded;
    const thresholds = {
      confidence: options.confidenceThreshold ?? entry.confidenceThreshold,
      iou: options.iouThreshold ?? entry.iouThreshold,
      maxDetections: options.maxDetections ?? entry.maxDetections,
    };
    try {
      const spec = tensorSpecFromManifest(entry);
      const t0 = this.now();
      // Letterbox to 640 × 640 on grey 114, RGB / 255, NCHW float32 (from the manifest); every image is disposed.
      const input = await imageFileToModelInput(path, spec, this.deps.pipeline.decoder);
      const t1 = this.now();
      // One output: `[1, 4 + labels, anchors]` (checked against the manifest at load).
      const [detectionsOut] = await model.run([input.tensor]);
      const t2 = this.now();
      if (!detectionsOut) throw new Error('The sidewall text detector returned no output.');
      const stats = yoloxOutputStats(detectionsOut, entry, thresholds.confidence);
      const inferred = inferBoxFormat(stats);
      const manifestFormat = entry.boxFormat;
      // The manifest's box format comes from the model card. If the raw range
      // clearly says otherwise, decode with what the tensor shows and say so.
      const used = options.boxFormat ?? (inferred && inferred !== manifestFormat ? inferred : manifestFormat);
      const decoded = decodeYoloxOutput(detectionsOut, entry, { ...options, boxFormat: used });
      const letterbox = input.letterbox;
      const detections: SidewallTextDetection[] = decoded.map(d => ({
        ...d,
        frameRect: letterbox ? detectionToFrameRect(d, letterbox) : null,
      }));
      const t3 = this.now();
      const result: SidewallTextFrameResult = {
        frame,
        source: input.source,
        letterbox,
        detections,
        timings: { decodeMs: t1 - t0, inferenceMs: t2 - t1, postMs: t3 - t2 },
        stats,
        boxFormat: { used, manifest: manifestFormat, inferred, overridden: used !== manifestFormat },
        thresholds,
        tensors: { inputs: model.inputs, outputs: model.outputs },
        delegate: loaded.delegate,
        modelVersion: entry.version,
        loadMs: this.loadMs,
      };
      sidewallDetectorLog(`${label}: ${detections.length} detections`, {
        source: [input.source.width, input.source.height],
        letterbox: letterbox && { scale: r3(letterbox.scale), padX: letterbox.padX, padY: letterbox.padY },
        timings: result.timings,
        stats,
        boxFormat: result.boxFormat,
        thresholds,
        detections: detections.map(d => ({
          label: d.label,
          score: r3(d.score),
          input: [d.x1, d.y1, d.x2, d.y2].map(Math.round),
          frame: d.frameRect && [d.frameRect.x, d.frameRect.y, d.frameRect.width, d.frameRect.height].map(Math.round),
        })),
      });
      return { status: 'done', result };
    } catch (e) {
      sidewallDetectorLog(`${label} failed`, { error: errorText(e) });
      return { status: 'failed', error: errorText(e) };
    }
  }

  /**
   * Stage 2: every detection of a frame result, cropped from the saved frame
   * as an axis-aligned box with a `CROP_PADDING_INPUT_PX` margin and read by
   * ML Kit at 0°, 90° CW, 90° CCW and 180°. The 0° crop is kept as a temporary JPEG for the card; the caller
   * deletes it with `deleteCropFiles`. Never throws: a crop or orientation
   * that fails is logged and left out.
   */
  async readCrops(result: SidewallTextFrameResult, frameIndex: number): Promise<SidewallCropsOutcome> {
    const ocr = this.deps.ocr;
    const label = `frame ${frameIndex + 1}`;
    if (!ocr || !ocr.ocrAvailable()) {
      sidewallDetectorLog(`${label}: crop OCR unavailable (no ML Kit in this build)`);
      return { status: 'unavailable', reason: 'ocr_missing' };
    }
    if (result.detections.length === 0) return { status: 'unavailable', reason: 'no_detections' };
    let path: string;
    try {
      path = localFramePath(result.frame, this.deps.pipeline);
    } catch (e) {
      sidewallDetectorLog(`${label}: crops skipped, not a local file`, { error: errorText(e) });
      return { status: 'unavailable', reason: 'no_detections' };
    }
    const crops: Omit<SidewallCropResult, 'verified' | 'ignored' | 'overlappedBy'>[] = [];
    const margin = cropMarginForFrame(result.letterbox?.scale);
    for (const [i, d] of result.detections.entries()) {
      const crop = d.frameRect ? paddedCropRect(d.frameRect, result.source, margin) : null;
      if (!crop) {
        sidewallDetectorLog(`${label} box ${i + 1} (${d.label}): no crop (box in the padding)`);
        continue;
      }
      const started = this.now();
      let thumbnailPath: string | null = null;
      const reads: CropRead[] = [];
      for (const rotation of CROP_ROTATIONS) {
        let file: string | null = null;
        try {
          file = await ocr.cropToTempFile(path, crop, rotation);
          const lines = await ocr.recognizeLines(file);
          reads.push(cropRead(d.label, rotation, lines, ocr.now()));
        } catch (e) {
          sidewallDetectorLog(`${label} box ${i + 1} (${d.label}) ${rotation}° failed`, { error: errorText(e) });
        } finally {
          if (file) {
            // The upright crop stays for the thumbnail; the turned ones are only OCR input.
            if (rotation === 0) thumbnailPath = file;
            else await ocr.deleteFile(file).catch(() => {});
          }
        }
      }
      const best = bestCropRead(reads);
      const crp = {
        detection: i,
        label: d.label,
        score: d.score,
        crop,
        thumbnailPath,
        reads,
        best,
        ocrMs: this.now() - started,
      };
      crops.push(crp);
      sidewallDetectorLog(
        `${label} box ${i + 1} (${d.label} ${r3(d.score)}): best ${best ? `${best.rotation}° score ${r3(best.score)}` : 'none'}`,
        {
          crop: [crop.x1, crop.y1, crop.x2 - crop.x1, crop.y2 - crop.y1],
          ocrMs: crp.ocrMs,
          reads: reads.map(r => ({
            rotation: r.rotation,
            score: r3(r.score),
            text: r.text,
            parsed: parsedFields(r),
          })),
        },
        { rawText: true },
      );
    }
    const judged = judgeCrops(crops).map(c => ({
      ...c,
      // judgeCrops counts positions in this list; report the box's own detection index.
      overlappedBy: c.overlappedBy === null ? null : crops[c.overlappedBy].detection,
    }));
    const ignored = judged.filter(c => c.ignored);
    if (ignored.length > 0) {
      sidewallDetectorLog(`${label}: ${ignored.length} of ${judged.length} boxes ignored`, {
        boxes: ignored.map(c => ({
          box: c.detection + 1,
          label: c.label,
          reason: c.ignored,
          overlappedBy: c.overlappedBy === null ? null : c.overlappedBy + 1,
        })),
      });
    }
    return { status: 'done', crops: judged };
  }
}

/** The fields one orientation's text parsed to, for logs. */
function parsedFields(r: CropRead): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['size', 'sizePartial', 'dotTin', 'make', 'model'] as const) {
    const v = r.reading[k];
    if (v) out[k] = v;
  }
  return out;
}

/** Deletes the thumbnails `readCrops` kept. */
export async function deleteCropFiles(crops: SidewallCropResult[], deleteFile: (p: string) => Promise<void>): Promise<void> {
  await Promise.all(crops.map(c => (c.thumbnailPath ? deleteFile(c.thumbnailPath).catch(() => {}) : Promise.resolve())));
}

type NitroImage = {
  readonly width: number;
  readonly height: number;
  cropAsync(x1: number, y1: number, x2: number, y2: number): Promise<NitroImage>;
  rotateAsync(degrees: number, allowFastFlagRotation?: boolean): Promise<NitroImage>;
  saveToTemporaryFileAsync(format: 'jpg', quality?: number): Promise<string>;
  dispose(): void;
};

function nitroImages(): { loadFromFileAsync(path: string): Promise<NitroImage> } {
  const { Images } = require('react-native-nitro-image') as typeof import('react-native-nitro-image');
  return Images as unknown as { loadFromFileAsync(path: string): Promise<NitroImage> };
}

/** Stage 2 native deps: nitro-image crop + physical rotation to a temp JPEG, ML Kit, file delete. */
export function defaultSidewallCropOcrDeps(): SidewallCropOcrDeps {
  return {
    ocrAvailable: isOcrAvailable,
    async cropToTempFile(path, rect, rotation) {
      const images: NitroImage[] = [];
      try {
        const frame = await nitroImages().loadFromFileAsync(path);
        images.push(frame);
        let img = await frame.cropAsync(rect.x1, rect.y1, rect.x2, rect.y2);
        images.push(img);
        if (rotation !== 0) {
          // Physically turned (not an orientation flag), so ML Kit sees upright text.
          img = await img.rotateAsync(rotation, false);
          images.push(img);
        }
        return await img.saveToTemporaryFileAsync('jpg', ocrConfig.jpegQualityPercent);
      } finally {
        for (const img of images) {
          try {
            img.dispose();
          } catch {
            // Already released.
          }
        }
      }
    },
    recognizeLines,
    deleteFile: async path => {
      const { unlink } = require('@dr.pogodin/react-native-fs') as typeof import('@dr.pogodin/react-native-fs');
      await unlink(path);
    },
    now: () => new Date(),
  };
}

function nitroDecoder(): ImageDecoder {
  // Loaded lazily so tests and builds without the module don't touch native code.
  const { Images } = require('react-native-nitro-image') as typeof import('react-native-nitro-image');
  return Images as unknown as ImageDecoder;
}

export function defaultSidewallTextDetectorDeps(
  manifest: ModelManifest = modelManifest,
  loaderDeps: () => ModelLoaderDeps = defaultModelLoaderDeps,
): SidewallTextDetectorDeps {
  return {
    // Platform defaults: Core ML then CPU on iOS, GPU then CPU on Android. Which
    // delegate accepts the YOLOX graph is part of the Stage 1 phone test.
    loadModel: async () => {
      const r = await loadModel('sidewallText', manifest, { ...loaderDeps(), log: sidewallDetectorLog });
      if (!r.ok) sidewallDetectorLog('model load failed', r.failure);
      return r;
    },
    pipeline: {
      resolveFramePath: absoluteFramePath,
      get decoder(): ImageDecoder {
        return nitroDecoder();
      },
    },
    ocr: defaultSidewallCropOcrDeps(),
  };
}

let instance: SidewallTextDetector | null = null;

/** One detector for the app, so the model is loaded once. */
export function getSidewallTextDetector(): SidewallTextDetector {
  instance ??= new SidewallTextDetector(defaultSidewallTextDetectorDeps());
  return instance;
}
