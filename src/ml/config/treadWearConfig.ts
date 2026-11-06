import { ACCELERATION_BY_PLATFORM } from '../inference/modelLoader';
import type { ModelDelegate } from '../inference/types';
import { modelManifest, type YoloDetectorManifestEntry } from '../manifest';

// Tread wear detector (`tread_wear.tflite`). The model values live in
// `modelManifest.treadWear`, the single source of truth; this file only
// gives them a typed, readable shape. Don't add model values here.

/** Wear classes in model output order (indices 0–13). Must equal the manifest labels. */
export const TREAD_WEAR_CLASSES = [
  'Alternate Lug Wear',
  'Center Wear',
  'Cupping _Scallop Wear',
  'Diagonal Wear',
  'Eccentric and Out-of-Round Wear',
  'Feather Edge',
  'Heel and Toe Wear',
  'Rip Depression and Punch Wear',
  'River_Channel Erosion Wear',
  'Shoulder Step Chamfer Wear',
  'Shoulder Wear Left',
  'Shoulder Wear Right',
  'Spotty Wear',
  'Wavy Wear',
] as const;

export type TreadWearClass = (typeof TREAD_WEAR_CLASSES)[number];

export function isTreadWearClass(label: string): label is TreadWearClass {
  return (TREAD_WEAR_CLASSES as readonly string[]).includes(label);
}

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
export function treadModelConfig(entry: YoloDetectorManifestEntry): TreadModelConfig {
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
 * The shipped model's config: 224 × 224 × 3 NCHW, confidence 0.25, IoU 0.45.
 * `null` only if `treadWear` is removed from the manifest (e.g. the AGPL
 * model is withdrawn); the detector then reports `model_missing`.
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

const SHOULDER: KnownPresentation = {
  title: 'Shoulder Wear',
  cause: 'Under-inflation or alignment issue',
  severityHint: 'Inspect camber and pressure',
};

const PATCHY: KnownPresentation = {
  title: 'Patchy Spot Wear',
  cause: 'Skid flat-spotting or out-of-round assembly',
  severityHint: 'Inspect roundness and tyre balance',
};

/**
 * User-facing titles, likely causes and advice per wear class. Owner-supplied
 * wording (2026-11-06). Classes not listed here get a cleaned-up title and no
 * cause or advice: none is made up.
 */
export const TREAD_WEAR_PRESENTATION: Readonly<Partial<Record<TreadWearClass, KnownPresentation>>> = {
  'Center Wear': {
    title: 'Center Tread Wear',
    cause: 'Over-inflation',
    severityHint: 'Adjust tyre pressure',
  },
  'Shoulder Wear Left': SHOULDER,
  'Shoulder Wear Right': SHOULDER,
  'Cupping _Scallop Wear': {
    title: 'Cupping / Scalloped Wear',
    cause: 'Worn suspension or shock absorbers',
    severityHint: 'Inspect dampers and balance',
  },
  'Heel and Toe Wear': {
    title: 'Heel & Toe Wear',
    cause: 'Suspension misalignment or rotation overdue',
    severityHint: 'Rotate tyres and check toe',
  },
  'Feather Edge': {
    title: 'Feathered Wear',
    cause: 'Toe alignment fault',
    severityHint: 'Perform wheel alignment',
  },
  'Diagonal Wear': {
    title: 'Diagonal Wear',
    cause: 'Wheel imbalance or rear axle misalignment',
    severityHint: 'Rebalance wheel assembly',
  },
  'Alternate Lug Wear': {
    title: 'Lug Tread Wear',
    cause: 'Aggressive torque or uneven load',
    severityHint: 'Inspect axle load and drive components',
  },
  'Spotty Wear': PATCHY,
  'Rip Depression and Punch Wear': PATCHY,
};

/** Words kept lower case inside a title (not first). */
const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

/**
 * Raw class name → clean title: underscores and extra spaces removed, each word
 * (and each part of a hyphenated word) capitalised, minor words lower case.
 * `River_Channel Erosion Wear` → `River Channel Erosion Wear`,
 * `Eccentric and Out-of-Round Wear` → `Eccentric and Out-of-Round Wear`.
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
 * not calibrated on real tyres. Severity is an indicator only; it never
 * changes the tyre status (Good / Replace soon / Replace now).
 */
export const TREAD_WEAR_SEVERITY = {
  criticalMinConfidence: 0.6,
} as const;
