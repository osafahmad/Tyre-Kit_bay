import type { TyreStatus } from '../features/inspection/types';

/**
 * Model manifest (spec §7). Every value must come from the training output
 * (e.g. TFLite `interpreter.get_input_details()` / `get_output_details()`).
 * Nothing is filled in until the owner provides the real .tflite files and
 * their input/output details. Don't guess these.
 *
 * An entry can only be added together with its .tflite file: Metro fails the
 * bundle if `require('../../assets/models/…tflite')` points at a missing file.
 */

export type TensorDType = 'uint8' | 'int8' | 'float32';

/** TFLite affine quantization: real = (q - zeroPoint) * scale. */
export type Quantization = { scale: number; zeroPoint: number };

type ModelEntryBase = {
  file: number; // require('../../assets/models/…tflite')
  version: string;
  /** Full input tensor shape including batch, e.g. [1, 224, 224, 3]. */
  inputShape: number[];
  inputLayout: 'NHWC' | 'NCHW';
  inputType: TensorDType;
  colorOrder: 'RGB' | 'BGR';
  /** How a frame is fitted to the input size. */
  resize: 'stretch' | 'center_crop';
  /**
   * Applied per channel to 0–255 pixel values: (pixel - mean[c]) / std[c].
   * `null` feeds raw 0–255 values.
   */
  normalisation: { mean: number[]; std: number[] } | null;
  /** Required when `inputType` is uint8 or int8: q = round(x / scale) + zeroPoint. */
  inputQuantization: Quantization | null;
  labels: string[];
  confidenceThreshold: number;
};

/** Single output tensor with one score per label, in `labels` order. */
export type ClassifierManifestEntry = ModelEntryBase & {
  outputFormat: 'class_scores';
  outputType: TensorDType;
  /** Required when `outputType` is uint8 or int8. */
  outputQuantization: Quantization | null;
  /** Whether the scores already sum to 1 or still need a softmax. */
  scores: 'probabilities' | 'logits';
  /** Which captured frames the model was trained on. */
  frames: 'sidewall' | 'tread' | 'both';
};

export type TreadManifestEntry = ClassifierManifestEntry & {
  /** Every label mapped to the status it means (Good / Replace soon / Replace now). */
  statusByLabel: Record<string, TyreStatus>;
};

export type DamageManifestEntry = ClassifierManifestEntry & {
  /** Labels that mean damage (e.g. cracked). Every other label means normal. */
  damageLabels: string[];
};

/**
 * Detector output decoding (YOLOX grid decode, NMS) needs the exported model's
 * real output layout. It's described here as text until the training output
 * exists; no decoder is built yet.
 */
export type DetectorManifestEntry = ModelEntryBase & {
  outputFormat: string;
};

export type ModelManifest = {
  tyreDetector: DetectorManifestEntry | null;
  tread: TreadManifestEntry | null;
  damage: DamageManifestEntry | null;
};

export type ModelKey = keyof ModelManifest;

/** Models the after-capture analysis needs. The detector only runs during preview. */
export const ANALYSIS_MODELS = ['tread', 'damage'] as const satisfies readonly ModelKey[];

export const modelManifest: ModelManifest = {
  tyreDetector: null,
  tread: null,
  damage: null,
};

export function missingModels(manifest: ModelManifest = modelManifest): ModelKey[] {
  return (Object.keys(manifest) as ModelKey[]).filter(k => manifest[k] === null);
}

export function hasAnalysisModels(manifest: ModelManifest = modelManifest): boolean {
  return ANALYSIS_MODELS.every(k => manifest[k] !== null);
}
