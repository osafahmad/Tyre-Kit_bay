import { unlink } from '@dr.pogodin/react-native-fs';
import { ocrConfig } from '../config/capture';
import { absoluteFramePath } from '../features/capture/frameFiles';
import { modelManifest, type ModelManifest, type YoloDetectorManifestEntry } from './manifest';
import { defaultModelLoaderDeps, loadModel, type ModelLoaderDeps } from './inference/modelLoader';
import { createSidewallTextDetector, localFramePath, type PipelineDeps } from './inference/pipeline';
import type { ImageDecoder } from './inference/tensorUtils';
import type { LoadedModel, PixelRect, SidewallTextRegion } from './inference/types';
import { isOcrAvailable, recognizeLines } from './ocr/ocr';
import {
  FIELD_BY_LABEL,
  agreedValue,
  fieldCandidate,
  fullFrameDotCandidate,
  fullFrameSizeCandidate,
  type FieldRead,
  type SidewallField,
} from './ocr/sidewallFields';
import type { OcrLineLike } from './ocr/textCandidates';

/**
 * Reads sidewall details from saved sidewall frames, on the phone: the text
 * detector finds the Brand / DOT / Model / Size regions, each region is
 * cropped and read with ML Kit, and the text goes through that field's
 * parser. The result is a set of suggestions for Sidewall captured; the user
 * confirms or corrects them. Any failure (no OCR, no detector, unreadable
 * frame or crop) just means fewer suggestions; it never throws.
 *
 * Full-frame fallback: when the detector finds no regions in a frame (or
 * isn't in the build), the whole frame is read with ML Kit, and only the
 * strict size and DOT patterns are taken from it. Make and model need a
 * detector crop.
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
const isRealFrame = (f: string) => !f.startsWith('demo://');

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
    detector ??= deps.loadDetector().catch(() => null);
    const loaded = await detector;
    if (!loaded) detector = null; // Retry on the next read.
    return loaded;
  };

  /** Crops one region, reads it and deletes the crop. Null if any step fails. */
  async function ocrRegion(region: SidewallTextRegion): Promise<OcrLineLike[] | null> {
    let crop: string | null = null;
    try {
      crop = await deps.cropToTempFile(localFramePath(region.frame, deps.pipeline), region.cropRect);
      return await deps.recognizeLines(crop);
    } catch {
      return null;
    } finally {
      if (crop) await deps.deleteFile(crop).catch(() => {});
    }
  }

  /** Reads a whole saved frame. Null if it can't be read. */
  async function ocrFullFrame(frame: string): Promise<OcrLineLike[] | null> {
    try {
      return await deps.recognizeLines(localFramePath(frame, deps.pipeline));
    } catch {
      return null;
    }
  }

  return {
    canRead: frames => deps.ocrAvailable() && frames.some(isRealFrame),

    async read(frames, isCancelled = () => false) {
      if (!deps.ocrAvailable()) return { status: 'unavailable', reason: 'ocr_missing' };
      const real = frames.filter(isRealFrame);
      if (real.length === 0) return { status: 'unavailable', reason: 'no_frames' };
      const model = await getDetector();
      const textDetector = model ? createSidewallTextDetector(model, deps.pipeline) : null;

      const reads: Record<SidewallField, FieldRead[]> = { size: [], dotTin: [], make: [], model: [] };
      const agreed = (field: SidewallField) =>
        agreedValue(reads[field], deps.minAgreeingReads) !== null;
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
          } catch {
            regions = []; // Detector error on this frame: treated as no regions.
          }
        }
        regionsFound += regions.length;

        if (regions.length === 0) {
          // Full-frame fallback: strict size / DOT patterns only.
          if (agreed('size') && agreed('dotTin')) continue;
          ocrRuns += 1;
          fullFrameRuns += 1;
          const lines = await ocrFullFrame(frame);
          if (!lines) continue;
          const size = agreed('size') ? null : fullFrameSizeCandidate(lines);
          const dot = agreed('dotTin') ? null : fullFrameDotCandidate(lines, deps.now());
          if (size) reads.size.push({ value: size, score: 0 });
          if (dot) reads.dotTin.push({ value: dot, score: 0 });
          continue;
        }

        for (const region of bestPerLabel(regions)) {
          const field = FIELD_BY_LABEL[region.label];
          if (!field || agreed(field)) continue;
          if (stop()) break;
          ocrRuns += 1;
          const lines = await ocrRegion(region);
          const value = lines ? fieldCandidate(field, lines, deps.now()) : null;
          if (value) reads[field].push({ value, score: region.score });
        }
      }

      const suggestions: SidewallSuggestions = {};
      for (const field of FIELDS) {
        const value = agreedValue(reads[field], deps.minAgreeingReads);
        if (value) suggestions[field] = value;
      }
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
      const r = await loadModel('sidewallTextDetector', manifest, loaderDeps());
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
