import type { TyreResult, TyreStatus } from '../../features/inspection/types';
import type {
  ClassifierManifestEntry,
  DamageManifestEntry,
  ModelKey,
  TensorDType,
  TreadManifestEntry,
} from '../manifest';

// Structures for the on-device pipeline (spec §7). Screens never see these;
// they go through `TyreAnalyzer`.

/** Hardware delegates as named by react-native-fast-tflite v3. `[]` means CPU. */
export type ModelDelegate = 'metal' | 'core-ml' | 'nnapi' | 'android-gpu';

/** The parts of a fast-tflite `TfliteModel` the pipeline uses. */
export type TensorInfo = { name: string; dataType: string; shape: number[] };

export interface InferenceModel {
  readonly inputs: TensorInfo[];
  readonly outputs: TensorInfo[];
  run(input: ArrayBuffer[]): Promise<ArrayBuffer[]>;
}

export type LoadedModel<E = ClassifierManifestEntry> = {
  key: ModelKey;
  entry: E;
  model: InferenceModel;
  /** Delegate that loaded, or 'cpu' after falling back. */
  delegate: ModelDelegate | 'cpu';
};

export type ModelLoadFailureReason =
  | 'not_in_manifest' // the owner hasn't supplied this model yet
  | 'invalid_manifest' // the entry is incomplete or inconsistent
  | 'asset_missing' // the entry exists but the file isn't in the build
  | 'load_failed' // the file is there but TFLite couldn't open it
  | 'manifest_mismatch'; // the model's tensors don't match the manifest

export type ModelLoadFailure = { key: ModelKey; reason: ModelLoadFailureReason; detail: string };

export type ModelLoadResult<E> =
  | { ok: true; model: LoadedModel<E> }
  | { ok: false; failure: ModelLoadFailure };

/** What the input tensor needs to look like, derived from a manifest entry. */
export type TensorSpec = {
  width: number;
  height: number;
  layout: 'NHWC' | 'NCHW';
  dtype: TensorDType;
  colorOrder: 'RGB' | 'BGR';
  resize: 'stretch' | 'center_crop';
  normalisation: { mean: number[]; std: number[] } | null;
  quantization: { scale: number; zeroPoint: number } | null;
};

/** Tightly or loosely packed 8-bit pixels, as Nitro Image returns them. */
export type RawPixels = {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  pixelFormat: string;
};

/** Scores averaged over every frame a classifier saw. */
export type ClassifierOutput = {
  scores: Float32Array;
  topLabel: string;
  topScore: number;
  framesUsed: number;
};

// ---- Tyre detector (preview, ~10 fps). Types only until the model exists. ----

export type TyreDetectorInput = { tensor: ArrayBuffer };

/** Box in 0–1 coordinates of the model input. */
export type TyreBox = { x: number; y: number; width: number; height: number; score: number };

export type TyreDetectorOutput = { boxes: TyreBox[] };

export interface TyreDetector {
  detect(input: TyreDetectorInput): Promise<TyreDetectorOutput>;
}

// ---- Sidewall: OCR plus parsers (spec §7), no TFLite model. ----

export type SidewallExtractorInput = {
  frames: string[];
  /** Values the user read or typed and confirmed on Sidewall captured. */
  userDetails: Partial<TyreResult>;
};

export type SidewallExtractorOutput = Pick<
  TyreResult,
  'size' | 'rimInches' | 'make' | 'model' | 'dotTin' | 'ageYears' | 'ageMonths'
>;

export interface SidewallExtractor {
  extract(input: SidewallExtractorInput): Promise<SidewallExtractorOutput>;
}

// ---- Tread: status classes first; mm only once validated against a gauge. ----

export type TreadEstimatorInput = { frames: string[] };

export type TreadEstimatorOutput = {
  status: TyreStatus;
  confidence: number;
  /** Always null until a validated depth output exists in the manifest. */
  depthMm: number | null;
  framesUsed: number;
};

export interface TreadEstimator {
  estimate(input: TreadEstimatorInput): Promise<TreadEstimatorOutput>;
}

// ---- Damage: normal or cracked. ----

export type DamageClassifierInput = { frames: string[] };

export type DamageClassifierOutput = {
  damageFound: boolean;
  /** Confidence in the reported answer (damage or no damage). */
  confidence: number;
  framesUsed: number;
};

export interface DamageClassifier {
  classify(input: DamageClassifierInput): Promise<DamageClassifierOutput>;
}

export type AnalysisModels = {
  tread: LoadedModel<TreadManifestEntry>;
  damage: LoadedModel<DamageManifestEntry>;
};
