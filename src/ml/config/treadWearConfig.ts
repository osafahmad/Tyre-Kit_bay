import type { TyreStatus } from '../../features/inspection/types';
import { ACCELERATION_BY_PLATFORM } from '../inference/modelLoader';
import type { ModelDelegate } from '../inference/types';
import { modelManifest, type SsdDetectorManifestEntry } from '../manifest';

// Tread wear detector (`tread_wear.tflite`, SSDLite). The model values live in
// `modelManifest.treadWear`, the single source of truth; this file only
// gives them a typed, readable shape. Don't add model values here.

/** The model's background class (label index 0). Never a detection. */
export const TREAD_WEAR_BACKGROUND = 'background';

/**
 * Detectable classes in model output order (label indices 1–15, owner's
 * labels.json 2026-11-10). With the background first, must equal the manifest labels.
 */
export const TREAD_WEAR_CLASSES = [
  'center_wear',
  'shoulder_wear',
  'camber_wear',
  'cupping_wear',
  'feathering',
  'flat_spot',
  'heel_toe_wear',
  'inner_edge_wear',
  'outer_edge_wear',
  'diagonal_wear',
  'sidewall_bulge',
  'exposed_cords',
  'cracking_dry_rot',
  'puncture_object',
  'normal_even_wear',
] as const;

export type TreadWearClass = (typeof TREAD_WEAR_CLASSES)[number];

export function isTreadWearClass(label: string): label is TreadWearClass {
  return (TREAD_WEAR_CLASSES as readonly string[]).includes(label);
}

/**
 * Means the tread looks evenly worn (owner decision 2026-11-10): never a
 * wear finding or defect. Other classes found alongside it still count.
 */
export const NO_DEFECT_CLASS: TreadWearClass = 'normal_even_wear';

/**
 * Damage classes that raise the tyre status (owner decision 2026-11-10).
 * `minConfidence` null means any detection above the model's confidence
 * threshold counts. The status is only ever raised, never lowered.
 */
export type TreadWearStatusRule = { minStatus: Exclude<TyreStatus, 'good'>; minConfidence: number | null };

export const TREAD_WEAR_STATUS_RULES: Readonly<Partial<Record<TreadWearClass, TreadWearStatusRule>>> = {
  exposed_cords: { minStatus: 'replace_now', minConfidence: 0.5 },
  sidewall_bulge: { minStatus: 'replace_now', minConfidence: 0.5 },
  cracking_dry_rot: { minStatus: 'replace_soon', minConfidence: null },
  puncture_object: { minStatus: 'replace_soon', minConfidence: null },
};

export type TreadModelConfig = {
  inputWidth: number;
  inputHeight: number;
  channels: number;
  layout: 'NHWC' | 'NCHW';
  /** Tried in order, then CPU. No NNAPI (deprecated on Android 15). */
  delegates: { ios: readonly ModelDelegate[]; android: readonly ModelDelegate[]; fallback: 'cpu' };
  confidenceThreshold: number;
  iouThreshold: number;
  maxDetections: number;
};

/** Typed view of a tread wear manifest entry. */
export function treadModelConfig(entry: SsdDetectorManifestEntry): TreadModelConfig {
  const [, a, b, c] = entry.inputShape;
  const nchw = entry.inputLayout === 'NCHW';
  return {
    inputWidth: nchw ? c : b,
    inputHeight: nchw ? b : a,
    channels: nchw ? a : c,
    layout: entry.inputLayout,
    delegates: { ...ACCELERATION_BY_PLATFORM, fallback: 'cpu' },
    confidenceThreshold: entry.confidenceThreshold,
    iouThreshold: entry.iouThreshold,
    maxDetections: entry.maxDetections,
  };
}

/**
 * The shipped model's config: 320 × 320 × 3 NHWC, confidence 0.35, IoU 0.45.
 * `null` only if `treadWear` is removed from the manifest; the detector then
 * reports `model_missing`.
 */
export const TREAD_MODEL_CONFIG: TreadModelConfig | null = modelManifest.treadWear
  ? treadModelConfig(modelManifest.treadWear)
  : null;

/** How a wear class is shown to users. `cause` and `severityHint` are null when not supplied. */
export type TreadWearPresentation = {
  title: string;
  cause: string | null;
  severityHint: string | null;
};

type KnownPresentation = { title: string; cause: string; severityHint: string };

/**
 * User-facing titles, likely causes and advice per class. Empty for the
 * SSDLite classes (owner decision 2026-11-10): titles are cleaned-up class
 * names and no cause or advice is shown until the owner supplies wording.
 * None is made up.
 */
export const TREAD_WEAR_PRESENTATION: Readonly<Partial<Record<TreadWearClass, KnownPresentation>>> = {};

/** Words kept lower case inside a title (not first). */
const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

/**
 * Raw class name → clean title: underscores and extra spaces removed, each word
 * (and each part of a hyphenated word) capitalised, minor words lower case.
 * `center_wear` → `Center Wear`, `cracking_dry_rot` → `Cracking Dry Rot`.
 */
export function formatWearTitle(raw: string): string {
  const words = raw.replace(/_/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, i) =>
      word
        .split('-')
        .map((part, j) => {
          const lower = part.toLowerCase();
          if ((i > 0 || j > 0) && MINOR_WORDS.has(lower)) return lower;
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('-'),
    )
    .join(' ');
}

/** Any model label (known or not) → what the user sees. */
export function describeTreadWear(label: string): TreadWearPresentation {
  const known = isTreadWearClass(label) ? TREAD_WEAR_PRESENTATION[label] : undefined;
  if (known) return { ...known };
  return { title: formatWearTitle(label), cause: null, severityHint: null };
}

/**
 * Wear severity shown by `useTyreInspection`. Owner decision 2026-11-06:
 * any wear class at or above this confidence is `critical`. A starting value,
 * not calibrated on real tyres. Severity itself never changes the tyre status;
 * only `TREAD_WEAR_STATUS_RULES` do (and they also make the severity `critical`).
 */
export const TREAD_WEAR_SEVERITY = {
  criticalMinConfidence: 0.6,
} as const;
