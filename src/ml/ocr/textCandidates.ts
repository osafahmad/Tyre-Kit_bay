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
 * The plate is normally the largest text inside the guide, so take the
 * tallest line with a plausible number of characters.
 */
export function plateCandidate(lines: OcrLineLike[], config = ocrConfig): string | null {
  let best: { value: string; height: number } | null = null;
  for (const line of lines) {
    const value = cleanPlateText(line.text);
    const n = alnumCount(value);
    if (n < config.plateMinChars || n > config.plateMaxChars) continue;
    if (
      !best ||
      line.frame.height > best.height ||
      (line.frame.height === best.height && value.length > best.value.length)
    ) {
      best = { value, height: line.frame.height };
    }
  }
  return best?.value ?? null;
}

/** Printed labels that sit next to chassis numbers and aren't part of them. */
const CHASSIS_LABELS = new Set(['VIN', 'NO', 'CHASSIS', 'FRAME', 'NUMBER', 'CH', 'ID']);

export type ChassisRead = {
  value: string | null;
  /** Text was found but is too small to read reliably: show `Move closer`. */
  tooSmall: boolean;
};

/**
 * Longest run of adjacent words on one line that makes 5–17 letters and
 * numbers including at least one digit. Leading labels such as `VIN` are
 * dropped. `cropHeight` is the height of the guide image the lines came from.
 */
export function chassisCandidate(
  lines: OcrLineLike[],
  cropHeight: number,
  config = ocrConfig,
): ChassisRead {
  let best: { value: string; height: number } | null = null;
  let sawSmallText = false;

  for (const line of lines) {
    const words = (line.elements?.length ? line.elements.map(e => e.text) : line.text.split(/\s+/))
      .map(w => w.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter(Boolean);
    while (words.length > 1 && CHASSIS_LABELS.has(words[0])) words.shift();

    for (let i = 0; i < words.length; i++) {
      let joined = '';
      for (let j = i; j < words.length; j++) {
        joined += words[j];
        if (joined.length > config.chassisMaxChars) break;
        if (joined.length < config.chassisMinChars || !/\d/.test(joined)) continue;
        if (cropHeight > 0 && line.frame.height / cropHeight < config.chassisMinTextHeightRatio) {
          sawSmallText = true;
          continue;
        }
        if (!best || joined.length > best.value.length) {
          best = { value: joined, height: line.frame.height };
        }
      }
    }
  }
  return { value: best?.value ?? null, tooSmall: best === null && sawSmallText };
}
