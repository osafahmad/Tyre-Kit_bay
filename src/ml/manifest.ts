import type { TyreStatus } from '../features/inspection/types';

/**
 * Model manifest (spec §7). Every value must come from the training output
 * (e.g. TFLite `interpreter.get_input_details()` / `get_output_details()`).
 * An entry is only filled in once the owner provides the real .tflite file
 * and its input/output details. Don't guess these.
 *
 * An entry can only be added together with its .tflite file in assets/models/: Metro fails the
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
  /**
   * How a frame is fitted to the input size. `letterbox` (Ultralytics):
   * scale to fit keeping aspect ratio, pad the rest.
   */
  resize: 'stretch' | 'center_crop' | 'letterbox';
  /** Required for `letterbox`: the 0–255 grey the padding is filled with (before normalisation). */
  letterboxPadValue?: number;
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

/**
 * Ultralytics YOLOv8 detection head exported without NMS: one output tensor
 * `[1, 4 + labels.length, anchors]`, per anchor 4 box values then one score
 * per label in `labels` order (already sigmoid scores). NMS is done by the app
 * (`decodeYoloDetections` in inference/tensorUtils.ts).
 */
export type YoloDetectorManifestEntry = ModelEntryBase & {
  outputFormat: 'yolov8_raw';
  outputType: TensorDType;
  /** Required when `outputType` is uint8 or int8. */
  outputQuantization: Quantization | null;
  /** Full output tensor shape, e.g. [1, 8, 1029]. */
  outputShape: number[];
  /**
   * The 4 box values per anchor: centre x, centre y, width, height, either
   * as 0–1 of the input size (`cxcywh_normalised`) or in input pixels.
   */
  boxFormat: 'cxcywh_normalised' | 'cxcywh_pixels';
  /** Overlapping boxes of the same label above this IoU are merged by NMS. */
  iouThreshold: number;
  /** Most boxes kept per frame after NMS. */
  maxDetections: number;
};

export type ModelManifest = {
  tyreDetector: DetectorManifestEntry | null;
  /** Finds the Brand, DOT code, Model and Size text regions on a sidewall frame. */
  sidewallTextDetector: YoloDetectorManifestEntry | null;
  tread: TreadManifestEntry | null;
  damage: DamageManifestEntry | null;
};

export type ModelKey = keyof ModelManifest;

/** Models the after-capture analysis needs. The detector only runs during preview. */
export const ANALYSIS_MODELS = ['tread', 'damage'] as const satisfies readonly ModelKey[];

export const modelManifest: ModelManifest = {
  // The spec's tyre detector (tyre position and distance in preview). Not supplied yet.
  tyreDetector: null,
  /**
   * `tyre_detector.tflite`, supplied by the owner 2026-11-06. Values are read
   * from the file itself (tensor details and the Ultralytics metadata.json
   * inside it), not from the export notes, which said NHWC/int8: the weights
   * are int8 but the input and output tensors are float32, and the input is
   * NCHW. `__tests__/manifest.test.ts` checks this entry against the file.
   * - normalisation: Ultralytics feeds RGB scaled to 0–1 (pixel / 255).
   * - letterbox: Ultralytics' padded resize; padding is grey 114, as in training.
   * - boxFormat: normalised, because the export wraps the model in Ultralytics'
   *   `_NormalizeCoords` (visible in the graph's tensor names). Confirm on a phone.
   * - iouThreshold 0.45: owner decision 2026-11-06. maxDetections 300: Ultralytics' default.
   * - confidenceThreshold: Ultralytics' default (0.25), owner-approved as a
   *   starting value. Calibrate it on real sidewalls.
   * Kept out of `tyreDetector` because it finds text regions, not the tyre.
   */
  sidewallTextDetector: {
    file: require('../../assets/models/tyre_detector.tflite'),
    version: 'yolov8n-ultralytics-8.4.203-2026-11-06T10:47:46Z',
    inputShape: [1, 3, 224, 224],
    inputLayout: 'NCHW',
    inputType: 'float32',
    colorOrder: 'RGB',
    resize: 'letterbox',
    letterboxPadValue: 114,
    normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
    inputQuantization: null,
    labels: ['Brand', 'Dot-Code', 'Model', 'Size'],
    confidenceThreshold: 0.25,
    outputFormat: 'yolov8_raw',
    outputType: 'float32',
    outputQuantization: null,
    outputShape: [1, 8, 1029],
    boxFormat: 'cxcywh_normalised',
    iouThreshold: 0.45,
    maxDetections: 300,
  },
  tread: null,
  damage: null,
};

export function missingModels(manifest: ModelManifest = modelManifest): ModelKey[] {
  return (Object.keys(manifest) as ModelKey[]).filter(k => manifest[k] === null);
}

export function hasAnalysisModels(manifest: ModelManifest = modelManifest): boolean {
  return ANALYSIS_MODELS.every(k => manifest[k] !== null);
}
