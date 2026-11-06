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

/**
 * Wear severity shown by `useTyreInspection`. Owner decision 2026-11-06:
 * any wear class at or above this confidence is `critical`. A starting value,
 * not calibrated on real tyres. Severity is an indicator only; it never
 * changes the tyre status (Good / Replace soon / Replace now).
 */
export const TREAD_WEAR_SEVERITY = {
  criticalMinConfidence: 0.6,
} as const;
