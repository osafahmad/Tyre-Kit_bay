/* eslint-env jest */
// TEST-ONLY manifest entries and fake TFLite bindings. These numbers are made
// up for unit tests and must never be copied into src/ml/manifest.ts.

import type { DamageManifestEntry, ModelManifest, TreadManifestEntry } from '../../manifest';
import type { ModelLoaderDeps } from '../modelLoader';
import type { DecodableImage, ImageDecoder } from '../tensorUtils';
import type { InferenceModel, RawPixels } from '../types';

export const TREAD_ASSET = 101;
export const DAMAGE_ASSET = 102;

export const treadEntry: TreadManifestEntry = {
  file: TREAD_ASSET,
  version: 'test-tread-1',
  inputShape: [1, 4, 4, 3],
  inputLayout: 'NHWC',
  inputType: 'float32',
  colorOrder: 'RGB',
  resize: 'stretch',
  normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
  inputQuantization: null,
  labels: ['good', 'soon', 'now'],
  confidenceThreshold: 0.5,
  outputFormat: 'class_scores',
  outputType: 'float32',
  outputQuantization: null,
  scores: 'probabilities',
  frames: 'tread',
  statusByLabel: { good: 'good', soon: 'replace_soon', now: 'replace_now' },
};

export const damageEntry: DamageManifestEntry = {
  file: DAMAGE_ASSET,
  version: 'test-damage-1',
  inputShape: [1, 4, 4, 3],
  inputLayout: 'NHWC',
  inputType: 'float32',
  colorOrder: 'RGB',
  resize: 'stretch',
  normalisation: null,
  inputQuantization: null,
  labels: ['normal', 'cracked'],
  confidenceThreshold: 0.6,
  outputFormat: 'class_scores',
  outputType: 'float32',
  outputQuantization: null,
  scores: 'probabilities',
  frames: 'sidewall',
  damageLabels: ['cracked'],
};

export const fullManifest: ModelManifest = {
  tyreDetector: null,
  treadWear: null,
  sidewallText: null,
  tread: treadEntry,
  damage: damageEntry,
};

export function fakeModel(
  entry: { inputShape: number[]; inputType: string; labels: string[]; outputType?: string },
  outputs: number[][] = [entry.labels.map((_, i) => (i === 0 ? 1 : 0))],
): InferenceModel & { run: jest.Mock } {
  let call = 0;
  return {
    inputs: [{ name: 'input', dataType: entry.inputType, shape: entry.inputShape }],
    outputs: [
      { name: 'scores', dataType: entry.outputType ?? 'float32', shape: [1, entry.labels.length] },
    ],
    run: jest.fn(async () => {
      const values = outputs[Math.min(call++, outputs.length - 1)];
      return [new Float32Array(values).buffer];
    }),
  };
}

/** iOS-like release deps: assets resolve to file:// paths that exist. */
export function fakeLoaderDeps(overrides: Partial<ModelLoaderDeps> = {}): ModelLoaderDeps & {
  createModel: jest.Mock;
} {
  const models: Record<string, InferenceModel> = {
    'file:///bundle/tread.tflite': fakeModel(treadEntry),
    'file:///bundle/damage.tflite': fakeModel(damageEntry),
  };
  const deps = {
    isDev: false,
    platform: 'ios',
    resolveAssetUri: (file: number) =>
      file === TREAD_ASSET
        ? 'file:///bundle/tread.tflite'
        : file === DAMAGE_ASSET
          ? 'file:///bundle/damage.tflite'
          : null,
    fileExists: jest.fn(async () => true),
    resourceExists: jest.fn(async () => true),
    copyResource: jest.fn(async () => {}),
    mkdir: jest.fn(async () => {}),
    cacheDir: '/caches',
    createModel: jest.fn(async (url: string) => {
      const m = models[url];
      if (!m) throw new Error(`no model at ${url}`);
      return m;
    }),
    acceleration: [],
    ...overrides,
  };
  return deps as ModelLoaderDeps & { createModel: jest.Mock };
}

/** Fake Nitro Image decoder producing solid RGBA images of a given size. */
export function fakeDecoder(size = { width: 8, height: 6 }, value = 255) {
  const created: (DecodableImage & { dispose: jest.Mock })[] = [];
  const make = (width: number, height: number): DecodableImage & { dispose: jest.Mock } => {
    const img = {
      width,
      height,
      cropAsync: jest.fn(async (x0: number, y0: number, x1: number, y1: number) =>
        make(x1 - x0, y1 - y0),
      ),
      resizeAsync: jest.fn(async (w: number, h: number) => make(w, h)),
      toRawPixelDataAsync: jest.fn(
        async (): Promise<RawPixels> => ({
          buffer: new Uint8Array(width * height * 4).fill(value).buffer,
          width,
          height,
          pixelFormat: 'RGBA',
        }),
      ),
      dispose: jest.fn(),
    };
    created.push(img);
    return img;
  };
  const decoder: ImageDecoder & { loadFromFileAsync: jest.Mock } = {
    loadFromFileAsync: jest.fn(async () => make(size.width, size.height)),
  };
  return { decoder, created };
}
