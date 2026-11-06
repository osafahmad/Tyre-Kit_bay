import { Image, Platform } from 'react-native';
import {
  CachesDirectoryPath,
  copyFileRes,
  exists,
  existsRes,
  mkdir,
} from '@dr.pogodin/react-native-fs';
import type { TyreStatus } from '../../features/inspection/types';
import type {
  ClassifierManifestEntry,
  DamageManifestEntry,
  ModelKey,
  ModelManifest,
  TreadManifestEntry,
  YoloDetectorManifestEntry,
} from '../manifest';
import type {
  InferenceModel,
  LoadedModel,
  ModelDelegate,
  ModelLoadFailure,
  ModelLoadFailureReason,
  ModelLoadResult,
} from './types';

/**
 * Safe model loader. It never throws: every problem comes back as a
 * `ModelLoadFailure`, so a build without models keeps the `Analysis pending`
 * flow instead of crashing. Models are only ever read from the app bundle
 * (or Metro's dev server in development builds), never downloaded.
 */

export type ModelLoaderDeps = {
  isDev: boolean;
  platform: string;
  /** `Image.resolveAssetSource(require(...)).uri`, or null if it can't be resolved. */
  resolveAssetUri(file: number): string | null;
  fileExists(path: string): Promise<boolean>;
  /** Android raw resource lookup, by `<name>.<ext>`. */
  resourceExists(fileName: string): Promise<boolean>;
  copyResource(fileName: string, destination: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  cacheDir: string;
  /** Opens a local `file://` (or dev-server) URL with the given delegates (`[]` = CPU). */
  createModel(url: string, delegates: ModelDelegate[]): Promise<InferenceModel>;
  /** Hardware delegates to try first, in order. CPU is always the last resort. */
  acceleration: ModelDelegate[];
};

export function defaultModelLoaderDeps(): ModelLoaderDeps {
  return {
    isDev: __DEV__,
    platform: Platform.OS,
    resolveAssetUri: file => Image.resolveAssetSource(file)?.uri ?? null,
    fileExists: exists,
    resourceExists: existsRes,
    copyResource: copyFileRes,
    mkdir: path => mkdir(path),
    cacheDir: CachesDirectoryPath,
    createModel: async (url, delegates) => {
      // Loaded lazily: the native module is only touched when a model exists.
      const { loadTensorflowModel } =
        require('react-native-fast-tflite') as typeof import('react-native-fast-tflite');
      return loadTensorflowModel({ url }, delegates);
    },
    // iOS: Core ML delegate is enabled in the Podfile. Android: GPU (OpenCL),
    // declared optional in the manifest. NNAPI is not used (DECISIONS.md M0).
    acceleration: Platform.OS === 'ios' ? ['core-ml'] : ['android-gpu'],
  };
}

const MODEL_EXT = 'tflite';
const TYRE_STATUSES: readonly TyreStatus[] = ['good', 'replace_soon', 'replace_now'];

const failure = (
  key: ModelKey,
  reason: ModelLoadFailureReason,
  detail: string,
): { ok: false; failure: ModelLoadFailure } => ({ ok: false, failure: { key, reason, detail } });

// ---------------------------------------------------------------- manifest

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Problems with a manifest entry, before any file is touched. Empty means usable. */
export function validateManifestEntry(
  key: ModelKey,
  entry: NonNullable<ModelManifest[ModelKey]>,
): string[] {
  const p: string[] = [];
  if (!isNum(entry.file)) p.push('file must be a require(...) of the .tflite asset');
  if (!entry.version) p.push('version is empty');

  const shape = entry.inputShape;
  if (shape.length !== 4 || shape.some(d => !Number.isInteger(d) || d <= 0)) {
    p.push('inputShape must be 4 positive integers');
  } else {
    if (shape[0] !== 1) p.push('inputShape batch must be 1');
    const channels = entry.inputLayout === 'NHWC' ? shape[3] : shape[1];
    if (channels !== 3) p.push('inputShape must have 3 colour channels');
  }

  const norm = entry.normalisation;
  if (norm) {
    if (norm.mean.length !== 3 || !norm.mean.every(isNum)) p.push('normalisation.mean needs 3 values');
    if (norm.std.length !== 3 || !norm.std.every(s => isNum(s) && s !== 0)) {
      p.push('normalisation.std needs 3 non-zero values');
    }
  }
  if (entry.inputType !== 'float32') {
    const q = entry.inputQuantization;
    if (!q || !isNum(q.scale) || q.scale <= 0 || !isNum(q.zeroPoint)) {
      p.push(`inputQuantization is required for ${entry.inputType} input`);
    }
  }
  if (entry.resize === 'letterbox') {
    const pad = entry.letterboxPadValue;
    if (!Number.isInteger(pad) || pad! < 0 || pad! > 255) {
      p.push('letterboxPadValue must be an integer 0–255 for letterbox resize');
    }
  }
  if (entry.labels.length === 0) p.push('labels are empty');
  if (new Set(entry.labels).size !== entry.labels.length) p.push('labels are not unique');
  if (!isNum(entry.confidenceThreshold) || entry.confidenceThreshold < 0 || entry.confidenceThreshold > 1) {
    p.push('confidenceThreshold must be between 0 and 1');
  }

  if (key === 'tread' || key === 'damage') {
    const c = entry as ClassifierManifestEntry;
    if (c.outputFormat !== 'class_scores') p.push(`outputFormat ${String(c.outputFormat)} is not supported`);
    if (c.outputType !== 'float32') {
      const q = c.outputQuantization;
      if (!q || !isNum(q.scale) || q.scale <= 0 || !isNum(q.zeroPoint)) {
        p.push(`outputQuantization is required for ${c.outputType} output`);
      }
    }
  }
  if (key === 'sidewallTextDetector') {
    const d = entry as YoloDetectorManifestEntry;
    if (d.outputFormat !== 'yolov8_raw') p.push(`outputFormat ${String(d.outputFormat)} is not supported`);
    if (d.outputType !== 'float32') {
      const q = d.outputQuantization;
      if (!q || !isNum(q.scale) || q.scale <= 0 || !isNum(q.zeroPoint)) {
        p.push(`outputQuantization is required for ${d.outputType} output`);
      }
    }
    const out = d.outputShape;
    if (!Array.isArray(out) || out.length !== 3 || out.some(n => !Number.isInteger(n) || n <= 0)) {
      p.push('outputShape must be 3 positive integers');
    } else {
      if (out[0] !== 1) p.push('outputShape batch must be 1');
      if (out[1] !== 4 + d.labels.length) {
        p.push(`outputShape needs 4 box values + ${d.labels.length} label scores, has ${out[1]}`);
      }
    }
    if (d.boxFormat !== 'cxcywh_normalised' && d.boxFormat !== 'cxcywh_pixels') {
      p.push(`boxFormat ${String(d.boxFormat)} is not supported`);
    }
    if (!isNum(d.iouThreshold) || d.iouThreshold <= 0 || d.iouThreshold > 1) {
      p.push('iouThreshold must be above 0 and at most 1');
    }
    if (!Number.isInteger(d.maxDetections) || d.maxDetections <= 0) {
      p.push('maxDetections must be a positive integer');
    }
  }
  if (key === 'tread') {
    const t = entry as TreadManifestEntry;
    for (const label of t.labels) {
      const s = t.statusByLabel?.[label];
      if (!s || !TYRE_STATUSES.includes(s)) p.push(`statusByLabel has no valid status for "${label}"`);
    }
  }
  if (key === 'damage') {
    const d = entry as DamageManifestEntry;
    if (!d.damageLabels?.length) p.push('damageLabels are empty');
    for (const label of d.damageLabels ?? []) {
      if (!d.labels.includes(label)) p.push(`damage label "${label}" is not in labels`);
    }
    if (d.damageLabels?.length === d.labels.length) p.push('at least one label must mean no damage');
  }
  return p;
}

/** Problems between a loaded model's tensors and its manifest entry. */
export function checkModelMatchesManifest(
  key: ModelKey,
  model: InferenceModel,
  entry: NonNullable<ModelManifest[ModelKey]>,
): string[] {
  const p: string[] = [];
  if (model.inputs.length !== 1) {
    p.push(`expected 1 input tensor, model has ${model.inputs.length}`);
  } else {
    const input = model.inputs[0];
    if (input.dataType !== entry.inputType) {
      p.push(`input type is ${input.dataType}, manifest says ${entry.inputType}`);
    }
    if (input.shape.join(',') !== entry.inputShape.join(',')) {
      p.push(`input shape is [${input.shape}], manifest says [${entry.inputShape}]`);
    }
  }
  if (model.outputs.length === 0) p.push('model has no outputs');
  if (key === 'sidewallTextDetector' && model.outputs.length > 0) {
    const d = entry as YoloDetectorManifestEntry;
    if (model.outputs.length !== 1) p.push(`expected 1 output tensor, model has ${model.outputs.length}`);
    const out = model.outputs[0];
    if (out.dataType !== d.outputType) {
      p.push(`output type is ${out.dataType}, manifest says ${d.outputType}`);
    }
    if (out.shape.join(',') !== d.outputShape.join(',')) {
      p.push(`output shape is [${out.shape}], manifest says [${d.outputShape}]`);
    }
  }
  if ((key === 'tread' || key === 'damage') && model.outputs.length > 0) {
    const c = entry as ClassifierManifestEntry;
    const out = model.outputs[0];
    if (out.dataType !== c.outputType) {
      p.push(`output type is ${out.dataType}, manifest says ${c.outputType}`);
    }
    const size = out.shape.reduce((a, b) => a * b, 1);
    if (size !== c.labels.length) {
      p.push(`output has ${size} values, manifest has ${c.labels.length} labels`);
    }
  }
  return p;
}

// ---------------------------------------------------------------- locating

/**
 * Where the bundled asset can be opened from, after checking it's really there.
 * - Development (Metro): the dev-server URL. Never allowed in release builds.
 * - iOS release: `file://` inside the app bundle.
 * - Android release: a raw resource name; fast-tflite can only open URLs, so
 *   the resource is copied to the app's cache and opened from there.
 */
export async function locateModelAsset(
  key: ModelKey,
  file: number,
  deps: ModelLoaderDeps,
): Promise<{ ok: true; url: string } | { ok: false; failure: ModelLoadFailure }> {
  let uri: string | null;
  try {
    uri = deps.resolveAssetUri(file);
  } catch (e) {
    return failure(key, 'asset_missing', `asset could not be resolved: ${message(e)}`);
  }
  if (!uri) return failure(key, 'asset_missing', 'asset could not be resolved');

  try {
    if (/^https?:\/\//i.test(uri)) {
      if (!deps.isDev) {
        return failure(key, 'load_failed', 'release builds only load models from the app bundle');
      }
      return { ok: true, url: uri };
    }
    if (uri.startsWith('file://') || uri.startsWith('/')) {
      const path = uri.startsWith('file://') ? decodeURI(uri.slice('file://'.length)) : uri;
      if (!(await deps.fileExists(path))) {
        return failure(key, 'asset_missing', 'model file is not in the app bundle');
      }
      return { ok: true, url: `file://${path}` };
    }
    if (deps.platform === 'android' && /^[a-z0-9_]+$/.test(uri)) {
      const name = `${uri}.${MODEL_EXT}`;
      if (!(await deps.resourceExists(name))) {
        return failure(key, 'asset_missing', 'model resource is not in the app bundle');
      }
      const dir = `${deps.cacheDir}/models`;
      await deps.mkdir(dir);
      const dest = `${dir}/${name}`;
      await deps.copyResource(name, dest);
      return { ok: true, url: `file://${dest}` };
    }
    return failure(key, 'asset_missing', 'model asset location is not recognised');
  } catch (e) {
    return failure(key, 'asset_missing', `model asset could not be read: ${message(e)}`);
  }
}

// ---------------------------------------------------------------- loading

async function openWithFallback(
  url: string,
  deps: ModelLoaderDeps,
): Promise<{ model: InferenceModel; delegate: ModelDelegate | 'cpu' }> {
  for (const delegate of deps.acceleration) {
    try {
      return { model: await deps.createModel(url, [delegate]), delegate };
    } catch {
      // Delegate not supported on this phone or for this model: try the next one.
    }
  }
  return { model: await deps.createModel(url, []), delegate: 'cpu' };
}

export async function loadModel<K extends ModelKey>(
  key: K,
  manifest: ModelManifest,
  deps: ModelLoaderDeps = defaultModelLoaderDeps(),
): Promise<ModelLoadResult<NonNullable<ModelManifest[K]>>> {
  const entry = manifest[key];
  if (!entry) return failure(key, 'not_in_manifest', 'model is not in this build');

  const problems = validateManifestEntry(key, entry);
  if (problems.length > 0) return failure(key, 'invalid_manifest', problems.join('; '));

  const located = await locateModelAsset(key, entry.file, deps);
  if (!located.ok) return located;

  let opened: Awaited<ReturnType<typeof openWithFallback>>;
  try {
    opened = await openWithFallback(located.url, deps);
  } catch (e) {
    return failure(key, 'load_failed', message(e));
  }

  const mismatch = checkModelMatchesManifest(key, opened.model, entry);
  if (mismatch.length > 0) return failure(key, 'manifest_mismatch', mismatch.join('; '));

  const loaded: LoadedModel<NonNullable<ModelManifest[K]>> = {
    key,
    entry: entry as NonNullable<ModelManifest[K]>,
    model: opened.model,
    delegate: opened.delegate,
  };
  return { ok: true, model: loaded };
}

/** Loads several models; returns what loaded and every failure. */
export async function loadModels<K extends ModelKey>(
  keys: readonly K[],
  manifest: ModelManifest,
  deps: ModelLoaderDeps = defaultModelLoaderDeps(),
): Promise<{
  models: { [P in K]?: LoadedModel<NonNullable<ModelManifest[P]>> };
  failures: ModelLoadFailure[];
}> {
  const models: { [P in K]?: LoadedModel<NonNullable<ModelManifest[P]>> } = {};
  const failures: ModelLoadFailure[] = [];
  // One at a time: keeps peak memory down on low-end phones.
  for (const key of keys) {
    const r = await loadModel(key, manifest, deps);
    if (r.ok) models[key] = r.model;
    else failures.push(r.failure);
  }
  return { models, failures };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
