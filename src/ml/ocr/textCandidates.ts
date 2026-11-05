import { ocrConfig } from '../../config/capture';

// Picks plate / chassis text out of OCR lines. Only text that was actually read
// is returned: letters and digits are never swapped (O/0, I/1, B/8…) and
// nothing is completed or reformatted beyond uppercasing.

export type OcrBox = { x: number; y: number; width: number; height: number };
export type OcrElementLike = { text: string; frame: OcrBox };
export type OcrLineLike = { text: string; frame: OcrBox; elements?: OcrElementLike[] };

/** Uppercase; keep letters, digits, single spaces and hyphens. */
export function cleanPlateText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[ -]+|[ -]+$/g, '');
}

const alnumCount = (s: string) => s.replace(/[^A-Z0-9]/g, '').length;

/**
 * OCR-only plate shape (docs/DECISIONS.md, plate reading rules): starts with a
 * letter, ends with a digit (so it contains digits). Typed plates are not
 * checked; see `normalisePlate`.
 */
const OCR_PLATE_SHAPE = /^[A-Z][A-Z0-9 -]*[0-9]$/;

type PlateLine = { index: number; value: string; frame: OcrBox };

export type PlateGroup = {
  /** Indexes into the OCR lines: one line, or two stacked lines of a two-line plate. */
  lines: number[];
  value: string;
  height: number;
  ok: boolean;
  /** Why it was accepted or rejected. */
  reason: string;
};

export type PlateExplanation = { value: string | null; groups: PlateGroup[] };

/** Two lines of one two-line plate: `a` above `b`, stacked, overlapping horizontally, similar height. */
function joinable(a: OcrBox, b: OcrBox, config: typeof ocrConfig): boolean {
  const minH = Math.min(a.height, b.height);
  const maxH = Math.max(a.height, b.height);
  if (minH <= 0 || minH / maxH < config.plateJoinMinHeightRatio) return false;
  const vOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (vOverlap / minH > config.plateJoinMaxVerticalOverlap) return false;
  if (b.y - (a.y + a.height) > config.plateJoinMaxGapRatio * maxH) return false;
  const minW = Math.min(a.width, b.width);
  const hOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return minW > 0 && hOverlap / minW >= config.plateJoinMinHorizontalOverlap;
}

/**
 * Groups OCR lines into plate candidates and says why each is or isn't a plate.
 * Two lines are joined with one space ("BKE 2090") only when they are stacked,
 * overlap horizontally and have similar text height, so small text above or
 * below the number stays separate. Text is kept as written; nothing is filtered
 * by word, and letters and digits are never swapped.
 */
export function explainPlateCandidate(lines: OcrLineLike[], config = ocrConfig): PlateExplanation {
  const items: PlateLine[] = lines
    .map((l, index) => ({ index, value: cleanPlateText(l.text), frame: l.frame }))
    .filter(l => alnumCount(l.value) > 0)
    .sort((p, q) => p.frame.y - q.frame.y || p.frame.x - q.frame.x);

  const used = new Set<number>();
  const groups: PlateGroup[] = [];
  for (let k = 0; k < items.length; k++) {
    if (used.has(k)) continue;
    used.add(k);
    const parts = [items[k]];
    for (let j = k + 1; j < items.length; j++) {
      if (!used.has(j) && joinable(items[k].frame, items[j].frame, config)) {
        used.add(j);
        parts.push(items[j]);
        break;
      }
    }
    const value = parts.map(p => p.value).join(' ');
    const n = alnumCount(value);
    const reason =
      n < config.plateMinChars
        ? `${n} letters/digits, under ${config.plateMinChars}`
        : n > config.plateMaxChars
          ? `${n} letters/digits, over ${config.plateMaxChars}`
          : !OCR_PLATE_SHAPE.test(value)
            ? 'must start with a letter and end with a digit'
            : parts.length > 1
              ? 'two-line plate'
              : 'ok';
    groups.push({
      lines: parts.map(p => p.index),
      value,
      height: Math.max(...parts.map(p => p.frame.height)),
      ok: reason === 'ok' || reason === 'two-line plate',
      reason,
    });
  }

  // The plate is normally the largest text inside the guide.
  let best: PlateGroup | null = null;
  for (const g of groups) {
    if (!g.ok) continue;
    if (!best || g.height > best.height || (g.height === best.height && g.value.length > best.value.length)) {
      best = g;
    }
  }
  return { value: best?.value ?? null, groups };
}

/** The plate read by OCR, or null when nothing plate-shaped was read. Never a guess. */
export function plateCandidate(lines: OcrLineLike[], config = ocrConfig): string | null {
  return explainPlateCandidate(lines, config).value;
}

/** Printed labels that sit next to chassis numbers and aren't part of them. */
const CHASSIS_LABELS = new Set(['VIN', 'NO', 'CHASSIS', 'FRAME', 'NUMBER', 'CH', 'ID']);

export type ChassisType = 'standard_vin' | 'jdm_frame' | 'legacy_frame';

export type ChassisValidation = {
  isValid: boolean;
  /** Uppercased, with spaces, hyphens and punctuation removed. Letters and digits are never swapped. */
  normalized: string;
  type?: ChassisType;
};

/** Spaces, hyphens/dashes and punctuation OCR picks up around or inside a chassis number. */
const CHASSIS_SEPARATORS = /[\s\-\u2010-\u2015_.,:;/\\|'"`*#()[\]{}]/g;
/** Tier 1: ISO 3779 VIN, 17 characters without I, O or Q. */
const STANDARD_VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
/** Tier 2: JDM frame number, 3–6 letter/digit model code then a 6–8 digit serial (9–14 total). */
const JDM_FRAME = /^[A-Z0-9]{3,6}[0-9]{6,8}$/;
/** Tier 3: other frame numbers (bikes, two-wheelers, commercial), 8–16 letters and digits. */
const LEGACY_FRAME = /^[A-Z0-9]{8,16}$/;

/**
 * OCR-only chassis check: is this read worth accepting as `Chassis found`?
 * Typed chassis numbers are never checked with this; see `isUnusualChassis`.
 * Every tier needs at least one digit. JDM and fallback frame numbers also
 * need a letter, so words, dates and long digit runs (barcodes, phone
 * numbers) are rejected.
 */
export function validateChassisCandidate(text: string): ChassisValidation {
  const normalized = text.toUpperCase().replace(CHASSIS_SEPARATORS, '');
  const invalid = { isValid: false, normalized };
  if (normalized.length < 8 || normalized.length > 17) return invalid;
  if (!/^[A-Z0-9]+$/.test(normalized) || !/[0-9]/.test(normalized)) return invalid;
  if (STANDARD_VIN.test(normalized)) return { isValid: true, normalized, type: 'standard_vin' };
  if (!/[A-Z]/.test(normalized)) return invalid;
  if (normalized.length >= 9 && normalized.length <= 14 && JDM_FRAME.test(normalized)) {
    return { isValid: true, normalized, type: 'jdm_frame' };
  }
  if (LEGACY_FRAME.test(normalized)) {
    return { isValid: true, normalized, type: 'legacy_frame' };
  }
  return invalid;
}

const TIER_RANK: Record<ChassisType, number> = { standard_vin: 3, jdm_frame: 2, legacy_frame: 1 };

export type ChassisRead = {
  value: string | null;
  type?: ChassisType;
  /** Text was found but is too small to read reliably: show `Move closer`. */
  tooSmall: boolean;
};

/**
 * Best run of adjacent words on one line that passes `validateChassisCandidate`.
 * A standard VIN beats a JDM frame number, which beats other frame numbers;
 * within a tier the longer run wins. Leading labels such as `VIN` are dropped.
 * Fallback-tier (`legacy_frame`) reads must be a single OCR word, so printed
 * text such as `MADE IN JAPAN 2019` isn't joined into a frame number.
 * `cropHeight` is the height of the guide image the lines came from.
 */
export function chassisCandidate(
  lines: OcrLineLike[],
  cropHeight: number,
  config = ocrConfig,
): ChassisRead {
  let best: { value: string; type: ChassisType } | null = null;
  let sawSmallText = false;

  for (const line of lines) {
    const words = (line.elements?.length ? line.elements.map(e => e.text) : line.text.split(/\s+/))
      .map(w => w.toUpperCase().replace(CHASSIS_SEPARATORS, ''))
      .filter(Boolean);
    while (words.length > 1 && CHASSIS_LABELS.has(words[0])) words.shift();

    for (let i = 0; i < words.length; i++) {
      let joined = '';
      for (let j = i; j < words.length; j++) {
        joined += words[j];
        if (joined.length > config.chassisMaxChars) break;
        const check = validateChassisCandidate(joined);
        if (!check.isValid || !check.type) continue;
        if (check.type === 'legacy_frame' && j > i) continue;
        if (cropHeight > 0 && line.frame.height / cropHeight < config.chassisMinTextHeightRatio) {
          sawSmallText = true;
          continue;
        }
        const rank = TIER_RANK[check.type];
        if (
          !best ||
          rank > TIER_RANK[best.type] ||
          (rank === TIER_RANK[best.type] && check.normalized.length > best.value.length)
        ) {
          best = { value: check.normalized, type: check.type };
        }
      }
    }
  }
  return best
    ? { value: best.value, type: best.type, tooSmall: false }
    : { value: null, tooSmall: sawSmallText };
}
