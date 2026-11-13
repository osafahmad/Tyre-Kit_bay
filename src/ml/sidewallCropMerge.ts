import { agreedValue, readKey, type FieldRead, type SidewallField } from './ocr/sidewallFields';
import { bestSizeRead, type SidewallSuggestions, type SuggestionBasis } from './sidewallReader';
import { FIELD_FOR_LABEL } from './services/sidewallCropOcr';
import type { SidewallCropResult } from './services/SidewallTextDetector';

// Stage 3 (owner request 2026-11-13): detector crop reads → sidewall field
// suggestions, merged with the whole-frame ML Kit suggestions. Every value is
// one the shared parsers accepted from a crop's own text (`filterSidewallText`
// in `cropRead`); nothing is built or corrected here.

/** A crop field value and how it was reached across the scan's frames. */
export type CropSuggestion = { value: string; basis: 'agreed' | 'single'; frames: number };
export type CropSuggestions = Partial<Record<SidewallField, CropSuggestion>>;

type FrameRead = FieldRead & { frame: number };

/**
 * Field reads from the verified, non-ignored crops of each frame. A box gives
 * only its own class's field (`Size` → size, `DOT` → DOT/TIN, `Brand` → make,
 * `Model` → model). A `Model` box's family also names its brand; that make
 * counts only when no `Brand` box read a make (owner decision 2026-11-11:
 * the family's brand is used when no other make rule fired). One read per
 * frame per value, so two boxes on the same text don't count as agreement.
 * Score: the detector's confidence for the box.
 */
export function cropFieldReads(frames: SidewallCropResult[][]): Record<SidewallField, FrameRead[]> {
  const reads: Record<SidewallField, FrameRead[]> = { size: [], dotTin: [], make: [], model: [] };
  const familyMakes: FrameRead[] = [];
  const add = (list: FrameRead[], read: FrameRead) => {
    const key = readKey(read.value);
    const same = list.find(r => r.frame === read.frame && readKey(r.value) === key);
    if (!same) list.push(read);
    else same.score = Math.max(same.score, read.score);
  };
  frames.forEach((crops, frame) => {
    for (const c of crops) {
      if (c.ignored || !c.best) continue;
      const field = FIELD_FOR_LABEL[c.label];
      if (!field) continue;
      const value = c.best.reading[field];
      if (value) add(reads[field], { value, score: c.score, frame });
      if (c.label === 'Model' && c.best.reading.make) add(familyMakes, { value: c.best.reading.make, score: c.score, frame });
    }
  });
  if (reads.make.length === 0) reads.make = familyMakes;
  return reads;
}

/**
 * One suggestion per field from the crop reads, with the same agreement rules
 * as the whole-frame reader (`sidewallReader.ts`): `minAgreeing` frames on the
 * same value is `agreed`. Otherwise size, make and model take the best single
 * read (owner decisions 2026-11-10 / 2026-11-11), and a DOT/TIN is suggested
 * whole only when every crop read the same TIN (owner decision round 9).
 */
export function cropSuggestions(frames: SidewallCropResult[][], minAgreeing: number): CropSuggestions {
  const reads = cropFieldReads(frames);
  const out: CropSuggestions = {};
  for (const field of ['size', 'dotTin', 'make', 'model'] as const) {
    const list = reads[field];
    if (list.length === 0) continue;
    const framesWith = (v: string) => new Set(list.filter(r => readKey(r.value) === readKey(v)).map(r => r.frame)).size;
    const agreed = agreedValue(list, minAgreeing);
    if (agreed) {
      out[field] = { value: agreed, basis: 'agreed', frames: framesWith(agreed) };
      continue;
    }
    if (field === 'dotTin') {
      if (new Set(list.map(r => readKey(r.value))).size === 1) out[field] = { value: list[0].value, basis: 'single', frames: 1 };
      continue;
    }
    const best = bestSizeRead(list);
    if (best) out[field] = { value: best, basis: 'single', frames: framesWith(best) };
  }
  return out;
}

/**
 * Strength of a suggestion, for choosing between the whole frame and the
 * crops. A crop read wins when it is at least as strong. Crops are zoomed on
 * the text the detector found, so on a tie the crop is preferred: on the
 * iPhone 13 test tyre the whole frame read `195/53 R15` and the `Size` crop
 * read `195/55 R15`.
 */
const FULL_RANK: Record<SuggestionBasis, number> = { agreed: 3, single: 2, joined: 2, date_code: 1 };
const CROP_RANK: Record<CropSuggestion['basis'], number> = { agreed: 3, single: 2 };

const dateCode = (dot: string) => dot.replace(/ /g, '').slice(-4);

export type MergeDecision = {
  field: SidewallField;
  chose: 'full_frame' | 'crop' | 'same';
  fullFrame: string | null;
  fullFrameBasis: SuggestionBasis | null;
  crop: string | null;
  cropBasis: CropSuggestion['basis'] | null;
  why: string;
};

/**
 * Whole-frame suggestions + crop suggestions → one value per field.
 * - Only one side has a value: that value.
 * - Same value (same letters and digits): the whole frame's spelling.
 * - DOT/TIN when the whole frame gave only the 4-digit date code: a crop TIN
 *   ending in that date code wins (it is the same date, with the whole TIN).
 *   A crop TIN with a different date code wins only if crops agreed on it.
 * - Otherwise the stronger basis wins (`FULL_RANK`, `CROP_RANK`); a tie goes to the crop.
 */
export function mergeCropSuggestions(
  fullFrame: SidewallSuggestions,
  fullBasis: Partial<Record<SidewallField, SuggestionBasis>>,
  crops: CropSuggestions,
): { suggestions: SidewallSuggestions; decisions: MergeDecision[] } {
  const suggestions: SidewallSuggestions = { ...fullFrame };
  const decisions: MergeDecision[] = [];
  for (const field of ['size', 'dotTin', 'make', 'model'] as const) {
    const full = fullFrame[field] ?? null;
    const crop = crops[field] ?? null;
    if (!crop) continue;
    // Missing basis (a value from an older reader) counts as a single read.
    const fb = full ? (fullBasis[field] ?? 'single') : null;
    const base = { field, fullFrame: full, fullFrameBasis: fb, crop: crop.value, cropBasis: crop.basis };
    if (!full) {
      suggestions[field] = crop.value;
      decisions.push({ ...base, chose: 'crop', why: 'whole frame read nothing' });
      continue;
    }
    if (readKey(full) === readKey(crop.value)) {
      decisions.push({ ...base, chose: 'same', why: 'both read the same value' });
      continue;
    }
    if (field === 'dotTin' && fb === 'date_code') {
      const sameDate = dateCode(crop.value) === dateCode(full);
      const take = sameDate || crop.basis === 'agreed';
      if (take) suggestions[field] = crop.value;
      decisions.push({
        ...base,
        chose: take ? 'crop' : 'full_frame',
        why: sameDate
          ? 'whole frame read only the date code; the crop read the whole TIN with that date code'
          : take
            ? 'crops agreed on a TIN with another date code'
            : 'the single crop TIN has another date code than the whole frame read',
      });
      continue;
    }
    const take = CROP_RANK[crop.basis] >= FULL_RANK[fb!];
    if (take) suggestions[field] = crop.value;
    decisions.push({
      ...base,
      chose: take ? 'crop' : 'full_frame',
      why: take ? `crop ${crop.basis} ≥ whole frame ${fb}` : `whole frame ${fb} > crop ${crop.basis}`,
    });
  }
  return { suggestions, decisions };
}
