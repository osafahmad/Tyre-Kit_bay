import { unlink } from '@dr.pogodin/react-native-fs';
import { ocrConfig } from '../config/capture';
import { absoluteFramePath } from '../features/capture/frameFiles';
import { modelManifest, type ModelManifest, type YoloDetectorManifestEntry } from './manifest';
import { defaultModelLoaderDeps, loadModel, type ModelLoaderDeps } from './inference/modelLoader';
import {
  createSidewallTextDetector,
  localFramePath,
  type PipelineDeps,
} from './inference/pipeline';
import type { ImageDecoder } from './inference/tensorUtils';
import type { LoadedModel, PixelRect, SidewallTextRegion } from './inference/types';
import { isOcrAvailable, recognizeLines } from './ocr/ocr';
import {
  FIELD_BY_LABEL,
  agreedValue,
  fieldCandidate,
  fullFrameDotCandidate,
  fullFrameMakeCandidate,
  fullFrameSizeCandidate,
  nearSameModel,
  type FieldRead,
  type SidewallField,
} from './ocr/sidewallFields';
import type { OcrLineLike } from './ocr/textCandidates';
import { sidewallLog } from './ocr/sidewallDebug';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const round = (n: number, places = 1) => Number(n.toFixed(places));
const roundRect = (r: PixelRect): PixelRect => ({
  x: round(r.x),
  y: round(r.y),
  width: round(r.width),
  height: round(r.height),
});

/**
 * Reads sidewall details from saved sidewall frames, on the phone: the text
 * detector finds the Brand / DOT / Model / Size regions, each region is
 * cropped and read with ML Kit, and the text goes through that field's
 * parser. The result is a set of suggestions for Sidewall captured; the user
 * confirms or corrects them. Any failure (no OCR, no detector, unreadable
 * frame or crop) just means fewer suggestions; it never throws.
 *
 * Full-frame fallback: when the detector finds no regions in a frame (or
 * isn't in the build), the whole frame is read with ML Kit, and only strict
 * patterns are taken from it: size, DOT, and make only as a known brand name
 * (config/tyreBrands.ts). Model needs a detector crop.
 */
export interface SidewallReader {
  /** Whether reading these frames is possible at all (cheap, synchronous). */
  canRead(frames: string[]): boolean;
  read(frames: string[], isCancelled?: () => boolean): Promise<SidewallReadOutcome>;
}

export type SidewallSuggestions = Partial<Record<SidewallField, string>>;

export type SidewallReadOutcome =
  | { status: 'unavailable'; reason: 'ocr_missing' | 'no_frames' }
  | {
      status: 'done';
      suggestions: SidewallSuggestions;
      /** Whether the text detector was available. Without it, only full-frame size / DOT reads run. */
      detector: 'used' | 'missing';
      /** Regions the detector found across all frames read. */
      regionsFound: number;
      /** OCR runs on region crops plus whole frames. */
      ocrRuns: number;
      fullFrameRuns: number;
    };

export type SidewallReaderDeps = {
  ocrAvailable(): boolean;
  /** The text detector, or null if it isn't in the build or won't open. */
  loadDetector(): Promise<LoadedModel<YoloDetectorManifestEntry> | null>;
  pipeline: PipelineDeps;
  /** Crops a saved frame (local path) to `rect` and writes it to a temporary JPEG. */
  cropToTempFile(framePath: string, rect: PixelRect): Promise<string>;
  recognizeLines(path: string): Promise<OcrLineLike[]>;
  deleteFile(path: string): Promise<void>;
  now(): Date;
  minAgreeingReads: number;
  maxOcrRuns: number;
};

const FIELDS: SidewallField[] = ['size', 'dotTin', 'make', 'model'];

/** The 4-digit date code at the end of a validated DOT read. */
const dateCode = (dot: string) => dot.replace(/ /g, '').slice(-4);
const isRealFrame = (f: string) => !f.startsWith('demo://');

/**
 * One crop covering the best Size and Model regions together (their crop
 * rects' bounding box), or null if the frame doesn't have both.
 */
export function sizeBandRegion(regions: SidewallTextRegion[]): SidewallTextRegion | null {
  const best = bestPerLabel(regions);
  const size = best.find(r => r.label === 'Size');
  const model = best.find(r => r.label === 'Model');
  if (!size || !model) return null;
  const a = size.cropRect;
  const b = model.cropRect;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  const rect = { x, y, width: right - x, height: bottom - y };
  return { ...size, label: 'Size+Model', box: rect, cropRect: rect };
}

/** The best-scoring region of each label in one frame. */
function bestPerLabel(regions: SidewallTextRegion[]): SidewallTextRegion[] {
  const best = new Map<string, SidewallTextRegion>();
  for (const r of regions) {
    const b = best.get(r.label);
    if (!b || r.score > b.score) best.set(r.label, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export function createSidewallReader(deps: SidewallReaderDeps): SidewallReader {
  let detector: Promise<LoadedModel<YoloDetectorManifestEntry> | null> | null = null;
  const getDetector = async () => {
    detector ??= deps.loadDetector().catch(e => {
      sidewallLog('detector load threw', { error: errorText(e) });
      return null;
    });
    const loaded = await detector;
    if (!loaded) detector = null; // Retry on the next read.
    sidewallLog(
      loaded
        ? `detector loaded (delegate ${loaded.delegate})`
        : 'detector NOT loaded: falling back to full-frame size/DOT only',
    );
    return loaded;
  };

  /** Crops one region, reads it and deletes the crop. Null if any step fails. */
  async function ocrRegion(region: SidewallTextRegion): Promise<OcrLineLike[] | null> {
    let crop: string | null = null;
    try {
      crop = await deps.cropToTempFile(localFramePath(region.frame, deps.pipeline), region.cropRect);
      return await deps.recognizeLines(crop);
    } catch (e) {
      sidewallLog(`crop/OCR failed for ${region.label}`, {
        stage: crop ? 'ocr' : 'crop',
        cropRect: region.cropRect,
        error: errorText(e),
      });
      return null;
    } finally {
      if (crop) await deps.deleteFile(crop).catch(() => {});
    }
  }

  /** Reads a whole saved frame. Null if it can't be read. */
  async function ocrFullFrame(frame: string): Promise<OcrLineLike[] | null> {
    // The saved frame itself (full camera resolution, cropped to the guide),
    // never the 224x224 detector input.
    const path = localFramePath(frame, deps.pipeline);
    try {
      const lines = await deps.recognizeLines(path);
      return lines;
    } catch (e) {
      sidewallLog(`full-frame OCR failed ${frame}`, { path, error: errorText(e) });
      return null;
    }
  }

  return {
    canRead: frames => deps.ocrAvailable() && frames.some(isRealFrame),

    async read(frames, isCancelled = () => false) {
      if (!deps.ocrAvailable()) return { status: 'unavailable', reason: 'ocr_missing' };
      const real = frames.filter(isRealFrame);
      if (real.length === 0) return { status: 'unavailable', reason: 'no_frames' };
      const minAgreeing = deps.minAgreeingReads;
      sidewallLog('read start', { frames: real.length, minAgreeing, maxOcrRuns: deps.maxOcrRuns });
      const model = await getDetector();
      const textDetector = model ? createSidewallTextDetector(model, deps.pipeline) : null;

      const reads: Record<SidewallField, FieldRead[]> = { size: [], dotTin: [], make: [], model: [] };
      // Stop reading a field early only when the same spelling agrees. Model's
      // near-identical grouping is applied to the final decision only, so more
      // frames can still settle which spelling is right.
      const agreed = (field: SidewallField) => agreedValue(reads[field], minAgreeing) !== null;
      let regionsFound = 0;
      let ocrRuns = 0;
      let fullFrameRuns = 0;
      const stop = () => isCancelled() || ocrRuns >= deps.maxOcrRuns;

      for (const frame of real) {
        if (stop() || FIELDS.every(agreed)) break;
        let regions: SidewallTextRegion[] = [];
        if (textDetector) {
          try {
            regions = await textDetector.detect(frame);
          } catch (e) {
            sidewallLog(`detector failed on ${frame}`, { error: errorText(e) });
            regions = []; // Detector error on this frame: treated as no regions.
          }
        }
        regionsFound += regions.length;
        if (textDetector) {
          sidewallLog(`frame ${real.indexOf(frame) + 1}/${real.length}: ${regions.length} regions`, {
            regions: regions.map(r => ({
              label: r.label,
              score: round(r.score, 3),
              box: roundRect(r.box),
              cropRect: r.cropRect,
            })),
          });
        }

        if (regions.length === 0) {
          // Full-frame fallback: strict size / DOT patterns, and make only
          // from a known brand name. Never model.
          if (agreed('size') && agreed('dotTin') && agreed('make')) continue;
          ocrRuns += 1;
          fullFrameRuns += 1;
          const lines = await ocrFullFrame(frame);
          if (!lines) continue;
          const size = agreed('size') ? null : fullFrameSizeCandidate(lines);
          const dot = agreed('dotTin') ? null : fullFrameDotCandidate(lines, deps.now());
          const make = agreed('make') ? null : fullFrameMakeCandidate(lines);
          // Whole-frame text can include background text (e.g. a plate): only parsed values are logged.
          sidewallLog('full-frame OCR (no regions)', { lines: lines.length, parsed: { size, dot, make } });
          if (size) reads.size.push({ value: size, score: 0 });
          if (dot) reads.dotTin.push({ value: dot, score: 0 });
          if (make) reads.make.push({ value: make, score: 0 });
          continue;
        }

        const sizeBefore = reads.size.length;
        const cropLines: OcrLineLike[] = [];
        for (const region of bestPerLabel(regions)) {
          const field = FIELD_BY_LABEL[region.label];
          if (!field || agreed(field)) continue;
          if (stop()) break;
          ocrRuns += 1;
          const lines = await ocrRegion(region);
          if (lines) cropLines.push(...lines);
          const value = lines ? fieldCandidate(field, lines, deps.now()) : null;
          if (value) reads[field].push({ value, score: region.score });
          if (lines) {
            sidewallLog(`ocr ${region.label} crop`, { text: lines.map(l => l.text), parsed: value });
          }
        }

        // Size fallback: the Size crop often lands on other text. Try the
        // strict size pattern on every crop read in this frame, then on one
        // crop spanning the Size and Model boxes (the size usually sits next to
        // the model on the same text band), then on the saved high-res frame
        // (also strict DOT, if DOT is still open).
        if (!agreed('size') && reads.size.length === sizeBefore) {
          const fromCrops = fullFrameSizeCandidate(cropLines);
          const band = fromCrops ? null : sizeBandRegion(regions);
          let fromBand: string | null = null;
          if (band && !stop()) {
            ocrRuns += 1;
            const lines = await ocrRegion(band);
            fromBand = lines ? fullFrameSizeCandidate(lines) : null;
            if (lines) sidewallLog('ocr Size+Model band crop', { text: lines.map(l => l.text), parsed: fromBand });
          }
          if (fromCrops || fromBand) {
            reads.size.push({ value: (fromCrops ?? fromBand)!, score: 0 });
          } else if (!stop()) {
            ocrRuns += 1;
            fullFrameRuns += 1;
            const lines = await ocrFullFrame(frame);
            const size = lines ? fullFrameSizeCandidate(lines) : null;
            const dot = lines && !agreed('dotTin') ? fullFrameDotCandidate(lines, deps.now()) : null;
            if (lines) sidewallLog('full-frame OCR (size fallback)', { lines: lines.length, parsed: { size, dot } });
            if (size) reads.size.push({ value: size, score: 0 });
            if (dot) reads.dotTin.push({ value: dot, score: 0 });
          }
        }
      }

      const suggestions: SidewallSuggestions = {};
      for (const field of FIELDS) {
        const value = agreedValue(reads[field], minAgreeing, field, field === 'model' ? nearSameModel : undefined);
        if (value) suggestions[field] = value;
      }
      if (!suggestions.dotTin && reads.dotTin.length > 0) {
        // Whole TINs disagree (noisy plant/size code) but the date code, which
        // gives the age, may agree: suggest the date code alone.
        const dateCodes = reads.dotTin.map(r => ({ value: dateCode(r.value), score: r.score }));
        const distinct = new Set(dateCodes.map(d => d.value));
        const code =
          agreedValue(dateCodes, minAgreeing, 'dotTin (date code only)') ??
          // Owner decision 2026-11-06: one valid date code with no competing
          // date code in any other frame is enough. Only the date code is
          // suggested, never a single unconfirmed TIN body.
          (distinct.size === 1 ? dateCodes[0].value : null);
        if (code) {
          suggestions.dotTin = code;
          sidewallLog(
            distinct.size === 1 && dateCodes.length < minAgreeing
              ? 'dotTin: single date code read, no competing date codes; suggesting the date code only'
              : 'dotTin: whole TINs disagree; suggesting the agreed date code only',
            { code, reads: dateCodes.length },
          );
        }
      }
      sidewallLog('read done', {
        suggestions,
        detector: textDetector ? 'used' : 'missing',
        regionsFound,
        ocrRuns,
        fullFrameRuns,
        cancelled: isCancelled(),
        hitOcrCap: ocrRuns >= deps.maxOcrRuns,
      });
      return {
        status: 'done',
        suggestions,
        detector: textDetector ? 'used' : 'missing',
        regionsFound,
        ocrRuns,
        fullFrameRuns,
      };
    },
  };
}

/** Fills only fields that are still empty and that the user hasn't touched. */
export function applySuggestions(
  current: Record<SidewallField, string>,
  suggestions: SidewallSuggestions,
  touched: ReadonlySet<SidewallField>,
): Record<SidewallField, string> {
  const next = { ...current };
  for (const field of FIELDS) {
    const s = suggestions[field];
    if (s && current[field] === '' && !touched.has(field)) next[field] = s;
  }
  return next;
}

type NitroImage = {
  cropAsync(x1: number, y1: number, x2: number, y2: number): Promise<NitroImage>;
  saveToTemporaryFileAsync(format: 'jpg', quality?: number): Promise<string>;
  dispose(): void;
};

function nitroImages(): { loadFromFileAsync(path: string): Promise<NitroImage> } {
  // Loaded lazily so tests and builds without the module don't touch native code.
  const { Images } = require('react-native-nitro-image') as typeof import('react-native-nitro-image');
  return Images as unknown as { loadFromFileAsync(path: string): Promise<NitroImage> };
}

export function defaultSidewallReaderDeps(
  manifest: ModelManifest = modelManifest,
  loaderDeps: () => ModelLoaderDeps = defaultModelLoaderDeps,
): SidewallReaderDeps {
  return {
    ocrAvailable: isOcrAvailable,
    loadDetector: async () => {
      const base = loaderDeps();
      // Log every delegate attempt: the shared loader falls back to CPU silently.
      const logged: ModelLoaderDeps = {
        ...base,
        createModel: async (url, delegates) => {
          const delegate = delegates[0] ?? 'cpu';
          try {
            const m = await base.createModel(url, delegates);
            sidewallLog(`detector opened with ${delegate}`, {
              input: m.inputs.map(t => [t.dataType, t.shape]),
              output: m.outputs.map(t => [t.dataType, t.shape]),
            });
            return m;
          } catch (e) {
            sidewallLog(`detector failed to open with ${delegate}`, { error: errorText(e) });
            throw e;
          }
        },
      };
      sidewallLog('detector loading', { acceleration: base.acceleration, platform: base.platform });
      const r = await loadModel('sidewallTextDetector', manifest, logged);
      if (!r.ok) sidewallLog('detector load failed', r.failure);
      return r.ok ? r.model : null;
    },
    pipeline: {
      resolveFramePath: absoluteFramePath,
      get decoder(): ImageDecoder {
        return nitroImages() as unknown as ImageDecoder;
      },
    },
    async cropToTempFile(framePath, rect) {
      const images: NitroImage[] = [];
      try {
        const frame = await nitroImages().loadFromFileAsync(framePath);
        images.push(frame);
        const crop = await frame.cropAsync(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
        images.push(crop);
        return await crop.saveToTemporaryFileAsync('jpg', ocrConfig.jpegQualityPercent);
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
    deleteFile: path => unlink(path),
    now: () => new Date(),
    minAgreeingReads: ocrConfig.sidewallMinAgreeingReads,
    maxOcrRuns: ocrConfig.sidewallMaxOcrRuns,
  };
}

let instance: SidewallReader | null = null;

/** One reader for the app, so the detector model is loaded once. */
export function getSidewallReader(): SidewallReader {
  instance ??= createSidewallReader(defaultSidewallReaderDeps());
  return instance;
}
