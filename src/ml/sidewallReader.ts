import { unlink } from '@dr.pogodin/react-native-fs';
import { ocrConfig } from '../config/capture';
import { absoluteFramePath } from '../features/capture/frameFiles';
import { localFramePath, type PipelineDeps } from './inference/pipeline';
import { isOcrAvailable, recognizeLines } from './ocr/ocr';
import {
  agreedValue,
  markerlessTinCandidate,
  readKey,
  sizeParts,
  type FieldRead,
  type SidewallField,
} from './ocr/sidewallFields';
import { parseTyreSize } from './ocr/parsers';
import type { OcrLineLike } from './ocr/textCandidates';
import { sidewallLog } from './ocr/sidewallDebug';
import { explainRejections, filterSidewallText, type SidewallTextReading } from './sidewallTextFilter';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Reads sidewall details from saved sidewall frames, on the phone. Each saved
 * frame (full camera resolution, already cropped to the guide) is read by
 * ML Kit text recognition, first its centre (`ocrConfig.sidewallCentreCropRatio`,
 * a stand-in for the old detector crop's zoom), then the whole frame if the
 * centre gave nothing new. Lines go through the semantic/spatial filter
 * (`sidewallTextFilter.ts`): size, DOT/TIN, and make only as a known brand
 * name. Model is never read. No TFLite model runs here (the AGPL-3.0 sidewall
 * text detector was removed, DECISIONS.md 2026-11-10).
 *
 * The result is a set of suggestions for Sidewall captured; the user confirms
 * or corrects them. Any failure (no OCR, unreadable frame, no text) just means
 * fewer suggestions; it never throws, and nothing is made up to fill a gap.
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
      /** ML Kit runs: centre crops plus whole frames. */
      ocrRuns: number;
    };

export type CentreCrop = { path: string; sourceWidth: number; sourceHeight: number };

export type SidewallReaderDeps = {
  ocrAvailable(): boolean;
  /** Saved (relative) frame path → local file path. */
  resolveFramePath: PipelineDeps['resolveFramePath'];
  /** Writes the centre `ratio` (of width and height) of a local image to a temporary JPEG. */
  cropCentreToTempFile(path: string, ratio: number): Promise<CentreCrop>;
  deleteFile(path: string): Promise<void>;
  recognizeLines(path: string): Promise<OcrLineLike[]>;
  now(): Date;
  centreCropRatio: number;
  minAgreeingReads: number;
  maxOcrRuns: number;
};

/** Fields the whole-frame filter can suggest. Model is never read from OCR. */
const READ_FIELDS = ['size', 'dotTin', 'make'] as const satisfies readonly SidewallField[];
type ReadField = (typeof READ_FIELDS)[number];
const FIELDS: SidewallField[] = ['size', 'dotTin', 'make', 'model'];

/** The 4-digit date code at the end of a validated DOT read. */
const dateCode = (dot: string) => dot.replace(/ /g, '').slice(-4);
const isRealFrame = (f: string) => !f.startsWith('demo://');

/**
 * Size and make without 2-frame agreement (owner decisions 2026-11-10): the read seen in
 * the most frames; ties go to the more complete read (a load/speed index was
 * read with it, `score` 1), then the longer value, then the earliest frame.
 * Always one of the reads, never a mix.
 */
export function bestSizeRead(reads: FieldRead[]): string | null {
  const groups = new Map<string, { first: FieldRead; count: number; score: number; order: number }>();
  reads.forEach((r, order) => {
    const key = readKey(r.value);
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.score = Math.max(g.score, r.score);
    } else groups.set(key, { first: r, count: 1, score: r.score, order });
  });
  const best = [...groups.entries()].sort(
    ([ka, a], [kb, b]) => b.count - a.count || b.score - a.score || kb.length - ka.length || a.order - b.order,
  )[0];
  return best ? best[1].first.value : null;
}

/**
 * The one value read in the most frames, or null when there is none or two
 * values tie for the most.
 */
export function dominantValue<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || (sorted.length > 1 && sorted[1][1] === sorted[0][1])) return null;
  return sorted[0][0];
}

export function createSidewallReader(deps: SidewallReaderDeps): SidewallReader {
  /** OCR of one image file; logs the raw text (TEMPORARY diagnostics). Null if it fails. */
  async function ocr(path: string, what: string, extra: Record<string, unknown> = {}): Promise<OcrLineLike[] | null> {
    try {
      const lines = await deps.recognizeLines(path);
      sidewallLog(`ML Kit raw text (${what})`, {
        ...extra,
        lines: lines.map(l => ({ text: l.text, height: Math.round(l.frame.height) })),
      });
      return lines;
    } catch (e) {
      sidewallLog(`OCR failed (${what})`, { path, error: errorText(e) });
      return null;
    }
  }

  /** The frame's centre crop, read and deleted. Null if any step fails. */
  async function ocrCentre(framePath: string, label: string): Promise<OcrLineLike[] | null> {
    let crop: CentreCrop | null = null;
    try {
      crop = await deps.cropCentreToTempFile(framePath, deps.centreCropRatio);
    } catch (e) {
      sidewallLog(`centre crop failed (${label})`, { path: framePath, error: errorText(e) });
      return null;
    }
    try {
      return await ocr(crop.path, `${label}, centre ${deps.centreCropRatio}`, {
        frameSize: [crop.sourceWidth, crop.sourceHeight],
      });
    } finally {
      await deps.deleteFile(crop.path).catch(() => {});
    }
  }

  return {
    canRead: frames => deps.ocrAvailable() && frames.some(isRealFrame),

    async read(frames, isCancelled = () => false) {
      if (!deps.ocrAvailable()) return { status: 'unavailable', reason: 'ocr_missing' };
      const real = frames.filter(isRealFrame);
      if (real.length === 0) return { status: 'unavailable', reason: 'no_frames' };
      const minAgreeing = deps.minAgreeingReads;
      sidewallLog('read start', {
        frames: real.length,
        minAgreeing,
        maxOcrRuns: deps.maxOcrRuns,
        centreCropRatio: deps.centreCropRatio,
      });

      const reads: Record<ReadField, FieldRead[]> = { size: [], dotTin: [], make: [] };
      const parts = { widthAspect: [] as string[], rim: [] as number[] };
      const markerlessTins: FieldRead[] = [];
      const agreed = (field: ReadField) => agreedValue(reads[field], minAgreeing) !== null;
      const open = () => READ_FIELDS.filter(f => !agreed(f));
      let ocrRuns = 0;
      const stop = () => isCancelled() || ocrRuns >= deps.maxOcrRuns;

      for (const [index, frame] of real.entries()) {
        if (stop() || open().length === 0) break;
        const label = `frame ${index + 1}/${real.length}`;
        let path: string;
        try {
          path = localFramePath(frame, deps);
        } catch (e) {
          sidewallLog(`${label}: not a local file`, { frame, error: errorText(e) });
          continue;
        }

        ocrRuns += 1;
        const centreLines = await ocrCentre(path, label);
        const parsed: SidewallTextReading = centreLines
          ? filterSidewallText(centreLines, deps.now())
          : { size: null, dotTin: null, make: null, loadSpeed: null };
        let source = 'centre';
        let lines = centreLines ?? [];
        // The centre crop can cut text off: read the whole frame when it gave nothing still needed.
        if (!open().some(f => parsed[f]) && !stop()) {
          ocrRuns += 1;
          const fullLines = await ocr(path, `${label}, whole frame`);
          if (fullLines) {
            const full = filterSidewallText(fullLines, deps.now());
            if (!parsed.size && full.size) parsed.loadSpeed = full.loadSpeed;
            for (const f of READ_FIELDS) parsed[f] ??= full[f];
            lines = [...lines, ...fullLines];
            source = centreLines ? 'centre + whole frame' : 'whole frame';
          }
        }
        sidewallLog(`${label}: parsed (${source})`, { parsed, rejected: explainRejections(lines, parsed) });
        if (!parsed.dotTin) {
          const tin = markerlessTinCandidate(lines, deps.now());
          if (tin) {
            markerlessTins.push({ value: tin, score: 0 });
            sidewallLog(`${label}: TIN-shaped line without a DOT marker`, { tin });
          }
        }
        if (!parsed.size) {
          const p = sizeParts(lines);
          if (p.widthAspect) parts.widthAspect.push(p.widthAspect);
          if (p.rim !== null) parts.rim.push(p.rim);
          if (p.widthAspect || p.rim !== null) sidewallLog(`${label}: size parts`, p);
        }

        for (const field of open()) {
          const value = parsed[field];
          if (!value) continue;
          reads[field].push({ value, score: field === 'size' && parsed.loadSpeed ? 1 : 0 });
        }
      }

      const suggestions: SidewallSuggestions = {};
      for (const field of READ_FIELDS) {
        const value = agreedValue(reads[field], minAgreeing);
        if (value) suggestions[field] = value;
      }
      for (const field of ['size', 'make'] as const) {
        if (suggestions[field] || reads[field].length === 0) continue;
        // Owner decisions 2026-11-10: a valid size or make read in one frame is
        // enough when no other frame agrees (blur, missed characters).
        const value = bestSizeRead(reads[field]);
        if (value) {
          suggestions[field] = value;
          sidewallLog(`${field}: no ${minAgreeing}-frame agreement; suggesting the best single read`, {
            value,
            reads: reads[field].map(r => r.value),
          });
        }
      }
      if (!suggestions.size && reads.size.length === 0) {
        // Owner decision 2026-11-10 (round 8): no frame read a whole size, but
        // one frame read the width/aspect and another the rim (with its
        // load/speed index). Join the most-read of each; a tie gives nothing.
        const widthAspect = dominantValue(parts.widthAspect);
        const rim = dominantValue(parts.rim);
        const p = widthAspect && rim !== null ? parseTyreSize(`${widthAspect} R${rim}`) : null;
        if (p) {
          suggestions.size = p.value;
          sidewallLog('size: no frame read a whole size; joined width/aspect and rim read in different frames', {
            value: p.value,
            parts,
          });
        }
      }
      if (!suggestions.dotTin && reads.dotTin.length > 0 && new Set(reads.dotTin.map(r => readKey(r.value))).size === 1) {
        // Owner decision 2026-11-10 (round 9): a single valid DOT/TIN read
        // (marker + 8–13 characters + valid date code), with no competing
        // read in any other frame, is suggested whole.
        suggestions.dotTin = reads.dotTin[0].value;
        sidewallLog('dotTin: single read, no competing reads; suggesting it whole', { value: suggestions.dotTin });
      }
      if (!suggestions.dotTin && reads.dotTin.length > 0) {
        // Whole TINs disagree (noisy plant/size code) but the date code, which
        // gives the age, may agree: suggest the date code alone.
        const dateCodes = reads.dotTin.map(r => ({ value: dateCode(r.value), score: r.score }));
        const distinct = new Set(dateCodes.map(d => d.value));
        const code =
          agreedValue(dateCodes, minAgreeing) ??
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
      if (!suggestions.dotTin && reads.dotTin.length === 0) {
        // Round 9: no frame read a DOT marker. A marker-less TIN-shaped line
        // is suggested only when 2 frames agree (never from one frame).
        const tin = agreedValue(markerlessTins, minAgreeing);
        if (tin) {
          suggestions.dotTin = tin;
          sidewallLog(`dotTin: no DOT marker read; ${minAgreeing} frames agree on a TIN-shaped line`, { value: tin });
        }
      }
      for (const field of READ_FIELDS) {
        if (suggestions[field]) continue;
        const values = reads[field].map(r => r.value);
        sidewallLog(`${field}: not suggested`, {
          why:
            values.length === 0
              ? 'no frame gave a valid read (see each frame\'s "rejected")'
              : `valid reads disagree or too few: needed ${minAgreeing} matching`,
          reads: values,
        });
      }
      sidewallLog('read done', {
        suggestions,
        ocrRuns,
        cancelled: isCancelled(),
        hitOcrCap: ocrRuns >= deps.maxOcrRuns,
      });
      return { status: 'done', suggestions, ocrRuns };
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
  readonly width: number;
  readonly height: number;
  cropAsync(x1: number, y1: number, x2: number, y2: number): Promise<NitroImage>;
  saveToTemporaryFileAsync(format: 'jpg', quality?: number): Promise<string>;
  dispose(): void;
};

function nitroImages(): { loadFromFileAsync(path: string): Promise<NitroImage> } {
  // Loaded lazily so tests and builds without the module don't touch native code.
  const { Images } = require('react-native-nitro-image') as typeof import('react-native-nitro-image');
  return Images as unknown as { loadFromFileAsync(path: string): Promise<NitroImage> };
}

/** The centred `ratio` × `ratio` part of a `width` × `height` image, in whole pixels. */
export function centreCropRect(width: number, height: number, ratio: number) {
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const x = Math.floor((width - w) / 2);
  const y = Math.floor((height - h) / 2);
  return { x1: x, y1: y, x2: x + w, y2: y + h };
}

export function defaultSidewallReaderDeps(): SidewallReaderDeps {
  return {
    ocrAvailable: isOcrAvailable,
    resolveFramePath: absoluteFramePath,
    async cropCentreToTempFile(path, ratio) {
      const images: NitroImage[] = [];
      try {
        const frame = await nitroImages().loadFromFileAsync(path);
        images.push(frame);
        const r = centreCropRect(frame.width, frame.height, ratio);
        const crop = await frame.cropAsync(r.x1, r.y1, r.x2, r.y2);
        images.push(crop);
        const out = await crop.saveToTemporaryFileAsync('jpg', ocrConfig.jpegQualityPercent);
        return { path: out, sourceWidth: frame.width, sourceHeight: frame.height };
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
    deleteFile: path => unlink(path),
    recognizeLines,
    now: () => new Date(),
    centreCropRatio: ocrConfig.sidewallCentreCropRatio,
    minAgreeingReads: ocrConfig.sidewallMinAgreeingReads,
    maxOcrRuns: ocrConfig.sidewallMaxOcrRuns,
  };
}

let instance: SidewallReader | null = null;

/** One reader for the app. */
export function getSidewallReader(): SidewallReader {
  instance ??= createSidewallReader(defaultSidewallReaderDeps());
  return instance;
}
