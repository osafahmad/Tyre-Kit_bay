import type { TyreStatus } from '../features/inspection/types';
import type { ModelDelegate } from './inference/types';

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
   * How a frame is fitted to the input size. `letterbox`: scale to fit
   * keeping aspect ratio, pad the rest (no bundled model uses it today).
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
  /**
   * Optional, per platform: the hardware delegates to try for this model,
   * replacing the platform default (`ACCELERATION_BY_PLATFORM`). `[]` opens it
   * on CPU straight away. Set only from a device measurement, and checked again
   * whenever the model file changes. This is a runtime choice, not a model value.
   */
  acceleration?: Partial<Record<'ios' | 'android', ModelDelegate[]>>;
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

/** torchvision `DefaultBoxGenerator` settings: one anchor set per feature map. */
export type SsdAnchorConfig = {
  generator: 'torchvision_default_boxes';
  /** Square feature map sizes, in head output order (e.g. 20 for 20 × 20). */
  featureMapSizes: number[];
  /** Extra aspect ratios per feature map; each adds a w/h and an h/w anchor. */
  aspectRatios: number[][];
  minRatio: number;
  maxRatio: number;
  /** torchvision `clip=True`: anchor widths and heights clamped to 0–1. */
  clip: boolean;
};

/**
 * SSD / SSDLite head exported without post-processing: one tensor of raw
 * anchor offsets `[1, anchors, 4]` (dx, dy, dw, dh) and one of class scores
 * `[1, anchors, labels]`. `labels` includes the background class. Decoding
 * and NMS are done by the app (`decodeSsdDetections` in inference/tensorUtils.ts).
 */
export type SsdDetectorManifestEntry = ModelEntryBase & {
  outputFormat: 'ssd_raw';
  /** Index of the background class in `labels`; never reported as a detection. */
  backgroundIndex: number;
  outputType: TensorDType;
  /** Required when `outputType` is uint8 or int8. */
  outputQuantization: Quantization | null;
  /** Output tensors by role, in the model's output order (boxes first). */
  outputs: {
    boxes: { name: string; shape: number[] };
    scores: { name: string; shape: number[] };
  };
  /** Whether the scores already sum to 1 per anchor or still need a softmax. */
  scores: 'probabilities' | 'logits';
  anchors: SsdAnchorConfig;
  /** torchvision `BoxCoder`: offset weights (wx, wy, ww, wh) and the dw/dh clamp. */
  boxCoder: { weights: [number, number, number, number]; bboxXformClip: number };
  /** Overlapping boxes of the same label above this IoU are merged by NMS. */
  iouThreshold: number;
  /** Most boxes kept per frame after NMS. */
  maxDetections: number;
};

export type ModelManifest = {
  tyreDetector: DetectorManifestEntry | null;
  tread: TreadManifestEntry | null;
  damage: DamageManifestEntry | null;
  /**
   * Finds tread wear patterns (centre wear, cupping, feather edge…) on a tread
   * frame. Optional and separate from `tread`: it says what kind of wear there
   * is, plus some damage classes that can raise the status (see
   * `TREAD_WEAR_STATUS_RULES` in config/treadWearConfig.ts).
   */
  treadWear: SsdDetectorManifestEntry | null;
};

/** Keys whose entries are `SsdDetectorManifestEntry`. */
export const SSD_MODELS = ['treadWear'] as const satisfies readonly ModelKey[];

export function isSsdModel(key: ModelKey): key is (typeof SSD_MODELS)[number] {
  return (SSD_MODELS as readonly ModelKey[]).includes(key);
}

export type ModelKey = keyof ModelManifest;

/** Models the after-capture analysis needs. The detector only runs during preview. */
export const ANALYSIS_MODELS = ['tread', 'damage'] as const satisfies readonly ModelKey[];

export const modelManifest: ModelManifest = {
  // The spec's tyre detector (tyre position and distance in preview, spec §7
  // YOLOX-Nano). Not supplied yet. Sidewall text is read by ML Kit on the
  // whole saved frame (sidewallReader.ts); no TFLite model runs for it.
  tyreDetector: null,
  tread: null,
  damage: null,
  /**
   * `tread_wear.tflite`, replaced by the owner 2026-11-10: torchvision
   * `ssdlite320_mobilenet_v3_large` (BSD-3-Clause), exported via ONNX and
   * onnx2tf. Replaces the AGPL-3.0 YOLOv8 model (DECISIONS.md).
   * - Tensors are read from the file (`__tests__/manifest.test.ts` checks them):
   *   input `[1, 320, 320, 3]` NHWC float32 (onnx2tf made it NHWC; the export
   *   notes said NCHW), outputs `raw_boxes` `[1, 3234, 4]` and `raw_scores`
   *   `[1, 3234, 16]`, float32. The file has no embedded labels or metadata.
   * - Owner answers 2026-11-10: plain stretch to 320 × 320, RGB / 255 with no
   *   ImageNet mean/std (the torchvision transform was left out of the export),
   *   softmax already in the graph, stock torchvision default anchors and box
   *   coder weights (10, 10, 5, 5), confidence 0.35, IoU 0.45, 300 detections.
   * - Anchors: torchvision's `DefaultBoxGenerator([[2, 3]] * 6, min_ratio=0.2,
   *   max_ratio=0.95)` on 20², 10², 5², 3², 2², 1² feature maps, 6 per cell
   *   = 3234 (torchvision `ssdlite.py` defaults, confirmed by the owner).
   * - Labels: owner's labels.json 2026-11-10, index 0 = background.
   * - Retrained by the owner 2026-11-12 (same architecture and tensors) on the
   *   Adtronics Tire Crack Detection v19 dataset, mapped onto the same 16-class
   *   layout. File SHA-256 23422e7dcdc5e064e4fbafe0f9567786b125b0fbb7e9fbb795e758418d4a9871.
   *   Every value above is unchanged; the file's tensors still match.
   * Normalisation and box decoding still need a check on a real tread frame.
   */
  treadWear: {
    file: require('../../assets/models/tread_wear.tflite'),
    version: 'ssdlite320-mobilenetv3-large-adtronics-crack-v19-2026-11-12',
    inputShape: [1, 320, 320, 3],
    inputLayout: 'NHWC',
    inputType: 'float32',
    colorOrder: 'RGB',
    resize: 'stretch',
    normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
    inputQuantization: null,
    labels: [
      'background',
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
    ],
    backgroundIndex: 0,
    confidenceThreshold: 0.35,
    outputFormat: 'ssd_raw',
    outputType: 'float32',
    outputQuantization: null,
    outputs: {
      boxes: { name: 'raw_boxes', shape: [1, 3234, 4] },
      scores: { name: 'raw_scores', shape: [1, 3234, 16] },
    },
    scores: 'probabilities',
    anchors: {
      generator: 'torchvision_default_boxes',
      featureMapSizes: [20, 10, 5, 3, 2, 1],
      aspectRatios: [[2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [2, 3]],
      minRatio: 0.2,
      maxRatio: 0.95,
      clip: true,
    },
    boxCoder: { weights: [10, 10, 5, 5], bboxXformClip: Math.log(1000 / 16) },
    iouThreshold: 0.45,
    maxDetections: 300,
    // iOS: CPU only (owner decision 2026-11-11, iPhone 13 logs). Core ML can't
    // build an interpreter for this SSDLite graph ("Failed to create TFLite
    // interpreter!") and the failed attempt cost 2,033 ms before the CPU
    // fallback. On CPU, inference is about 16 ms per frame. Android keeps the GPU default.
    acceleration: { ios: [] },
  },
};

export function missingModels(manifest: ModelManifest = modelManifest): ModelKey[] {
  return (Object.keys(manifest) as ModelKey[]).filter(k => manifest[k] === null);
}

export function hasAnalysisModels(manifest: ModelManifest = modelManifest): boolean {
  return ANALYSIS_MODELS.every(k => manifest[k] !== null);
}
