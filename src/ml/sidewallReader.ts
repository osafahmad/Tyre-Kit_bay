import { ocrConfig } from '../config/capture';
import { absoluteFramePath } from '../features/capture/frameFiles';
import { localFramePath, type PipelineDeps } from './inference/pipeline';
import { isOcrAvailable, recognizeLines } from './ocr/ocr';
import { agreedValue, type FieldRead, type SidewallField } from './ocr/sidewallFields';
import type { OcrLineLike } from './ocr/textCandidates';
import { sidewallLog } from './ocr/sidewallDebug';
import { filterSidewallText } from './sidewallTextFilter';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Reads sidewall details from saved sidewall frames, on the phone: each whole
 * saved frame (full camera resolution, cropped to the guide) is passed to
 * ML Kit text recognition, and its lines go through the semantic/spatial
 * filter (`sidewallTextFilter.ts`): size, DOT/TIN, and make only as a known
 * brand name. Model is never read. No TFLite model runs here (the AGPL-3.0
 * sidewall text detector was removed, DECISIONS.md 2026-11-10).
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
      /** Whole-frame OCR runs (one per saved frame read). */
      ocrRuns: number;
    };

export type SidewallReaderDeps = {
  ocrAvailable(): boolean;
  /** Saved (relative) frame path → local file path. */
  resolveFramePath: PipelineDeps['resolveFramePath'];
  recognizeLines(path: string): Promise<OcrLineLike[]>;
  now(): Date;
  minAgreeingReads: number;
  maxOcrRuns: number;
};

/** Fields the whole-frame filter can suggest. Model is never read from OCR. */
const READ_FIELDS = ['size', 'dotTin', 'make'] as const satisfies readonly SidewallField[];
const FIELDS: SidewallField[] = ['size', 'dotTin', 'make', 'model'];

/** The 4-digit date code at the end of a validated DOT read. */
const dateCode = (dot: string) => dot.replace(/ /g, '').slice(-4);
const isRealFrame = (f: string) => !f.startsWith('demo://');

export function createSidewallReader(deps: SidewallReaderDeps): SidewallReader {
  /** Reads a whole saved frame. Null if it can't be read. */
  async function ocrFrame(frame: string): Promise<OcrLineLike[] | null> {
    let path: string | null = null;
    try {
      path = localFramePath(frame, deps);
      return await deps.recognizeLines(path);
    } catch (e) {
      sidewallLog(`OCR failed ${frame}`, { path, error: errorText(e) });
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

      const reads: Record<(typeof READ_FIELDS)[number], FieldRead[]> = { size: [], dotTin: [], make: [] };
      const agreed = (field: (typeof READ_FIELDS)[number]) => agreedValue(reads[field], minAgreeing) !== null;
      let ocrRuns = 0;

      for (const frame of real) {
        if (isCancelled() || ocrRuns >= deps.maxOcrRuns || READ_FIELDS.every(agreed)) break;
        ocrRuns += 1;
        const lines = await ocrFrame(frame);
        if (!lines) continue;
        const parsed = filterSidewallText(lines, deps.now());
        // Whole-frame text can include background text (e.g. a plate): only parsed values are logged.
        sidewallLog(`frame ${real.indexOf(frame) + 1}/${real.length}`, { lines: lines.length, parsed });
        for (const field of READ_FIELDS) {
          const value = parsed[field];
          if (value && !agreed(field)) reads[field].push({ value, score: 0 });
        }
      }

      const suggestions: SidewallSuggestions = {};
      for (const field of READ_FIELDS) {
        const value = agreedValue(reads[field], minAgreeing);
        if (value) suggestions[field] = value;
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

export function defaultSidewallReaderDeps(): SidewallReaderDeps {
  return {
    ocrAvailable: isOcrAvailable,
    resolveFramePath: absoluteFramePath,
    recognizeLines,
    now: () => new Date(),
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
