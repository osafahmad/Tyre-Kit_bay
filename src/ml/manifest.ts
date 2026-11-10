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
  /** Finds the Brand, DOT code, Model and Size text regions on a sidewall frame. */
  sidewallTextDetector: YoloDetectorManifestEntry | null;
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

/** Keys whose entries are `YoloDetectorManifestEntry`. */
export const YOLO_MODELS = ['sidewallTextDetector'] as const satisfies readonly ModelKey[];

export function isYoloModel(key: ModelKey): key is (typeof YOLO_MODELS)[number] {
  return (YOLO_MODELS as readonly ModelKey[]).includes(key);
}

/** Keys whose entries are `SsdDetectorManifestEntry`. */
export const SSD_MODELS = ['treadWear'] as const satisfies readonly ModelKey[];

export function isSsdModel(key: ModelKey): key is (typeof SSD_MODELS)[number] {
  return (SSD_MODELS as readonly ModelKey[]).includes(key);
}

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
   * Normalisation and box decoding still need a check on a real tread frame.
   */
  treadWear: {
    file: require('../../assets/models/tread_wear.tflite'),
    version: 'ssdlite320-mobilenetv3-large-torchvision-2026-11-10',
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
  },
};

export function missingModels(manifest: ModelManifest = modelManifest): ModelKey[] {
  return (Object.keys(manifest) as ModelKey[]).filter(k => manifest[k] === null);
}

export function hasAnalysisModels(manifest: ModelManifest = modelManifest): boolean {
  return ANALYSIS_MODELS.every(k => manifest[k] !== null);
}
