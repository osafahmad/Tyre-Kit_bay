import { ModelUnavailableError } from '../../analyzer';
import { modelManifest, type ModelKey } from '../../manifest';
import { TfliteTyreAnalyzer } from '../../tfliteAnalyzer';
import { fakeLoaderDeps } from '../__fixtures__/models';
import { readFile, readTfliteFile } from '../__fixtures__/tfliteFile';
import { loadModel } from '../modelLoader';
import type { InferenceModel } from '../types';

// iOS release builds: how a bundled model is found on the phone.
//
// `react-native bundle --platform ios --dev false` (run by Xcode's "Bundle React
// Native code and images" phase) copies each required .tflite into the app at
// `TyreKitBay.app/assets/assets/models/<name>.tflite`, and registers it as below
// (copied from that bundle's output, 2026-11-06). `Image.resolveAssetSource`
// then turns the registration into a file:// URL next to `main.jsbundle`.
// These tests run React Native's real resolver on those registrations, then the
// real loader on the result, so a change on either side shows up here.

declare const __dirname: string;

// React Native's own resolver (the one behind Image.resolveAssetSource). The
// package ships no types for this internal path.
type PackagerAsset = { __packager_asset: boolean; httpServerLocation: string; scales: number[]; hash: string; name: string; type: string };
const AssetSourceResolver = (
  // eslint-disable-next-line @react-native/no-deep-imports -- testing the exact resolver Image.resolveAssetSource uses
  require('react-native/Libraries/Image/AssetSourceResolver') as {
    default: new (serverUrl: string | null, jsbundleUrl: string | null, asset: PackagerAsset) => {
      defaultAsset(): { uri: string };
    };
  }
).default;
const ROOT = `${__dirname}/../../../..`;

const APP = '/private/var/containers/Bundle/Application/3F2A9C1E-0000-4000-8000-000000000000/TyreKitBay.app';
const JS_BUNDLE_URL = `file://${APP}/`;

const REGISTERED = {
  treadWear: {
    __packager_asset: true,
    httpServerLocation: '/assets/assets/models',
    scales: [1],
    hash: 'ba4bbafa2841abf635796268f14e4296',
    name: 'tread_wear',
    type: 'tflite',
  },
} as const;

const BUNDLED_PATH = {
  treadWear: `${APP}/assets/assets/models/tread_wear.tflite`,
};

const SOURCE_FILE = {
  treadWear: `${ROOT}/assets/models/tread_wear.tflite`,
};

type BundledKey = keyof typeof REGISTERED;
const KEYS: BundledKey[] = ['treadWear'];

/** What `Image.resolveAssetSource` returns for this asset in an iOS release build. */
function releaseUri(key: BundledKey): string {
  // serverUrl null: no Metro server in a release build.
  const resolver = new AssetSourceResolver(null, JS_BUNDLE_URL, { ...REGISTERED[key], scales: [...REGISTERED[key].scales] });
  return resolver.defaultAsset().uri;
}

/** A loaded model reporting the real file's tensors, as fast-tflite would. */
function realModel(key: BundledKey): InferenceModel {
  const file = readTfliteFile(readFile(SOURCE_FILE[key]));
  return { inputs: file.inputs, outputs: file.outputs, run: jest.fn() };
}

/**
 * iOS release deps for loading `key`: only the given files exist in the bundle;
 * Core ML first, then CPU. (Jest maps every .tflite to the same asset id, so
 * the URI is chosen by key here; on a phone each model has its own id.)
 */
function iosReleaseDeps(key: BundledKey, files: Record<string, BundledKey>, coreMlWorks = true) {
  return fakeLoaderDeps({
    isDev: false,
    platform: 'ios',
    resolveAssetUri: () => releaseUri(key),
    fileExists: jest.fn(async (path: string) => path in files),
    createModel: jest.fn(async (url: string, delegates: string[]) => {
      if (delegates.includes('core-ml') && !coreMlWorks) throw new Error('Core ML delegate unavailable');
      const bundled = files[url.replace(/^file:\/\//, '')];
      if (!bundled) throw new Error(`no model at ${url}`);
      return realModel(bundled);
    }),
    acceleration: ['core-ml'],
  });
}

const bundled = { [BUNDLED_PATH.treadWear]: 'treadWear' } as Record<string, BundledKey>;

describe('iOS release bundle', () => {
  test.each(KEYS)('%s resolves to its file next to main.jsbundle', key => {
    expect(releaseUri(key)).toBe(`file://${BUNDLED_PATH[key]}`);
  });

  test.each(KEYS)('%s loads from the app bundle with Core ML', async key => {
    const deps = iosReleaseDeps(key, bundled);
    const r = await loadModel(key, modelManifest, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.model.delegate).toBe('core-ml');
    expect(deps.fileExists).toHaveBeenCalledWith(BUNDLED_PATH[key]);
    expect(deps.createModel).toHaveBeenCalledWith(`file://${BUNDLED_PATH[key]}`, ['core-ml']);
  });

  test.each(KEYS)('%s falls back to CPU when Core ML fails', async key => {
    const deps = iosReleaseDeps(key, bundled, false);
    const r = await loadModel(key, modelManifest, deps);
    expect(r.ok && r.model.delegate).toBe('cpu');
    expect(deps.createModel).toHaveBeenLastCalledWith(`file://${BUNDLED_PATH[key]}`, []);
  });

  test('app paths with spaces or percent-encoding are decoded before the existence check', async () => {
    const app = '/var/mobile/My Apps/TyreKitBay.app';
    const path = `${app}/assets/assets/models/tread_wear.tflite`;
    const deps = fakeLoaderDeps({
      isDev: false,
      platform: 'ios',
      resolveAssetUri: () => `file://${encodeURI(path)}`,
      fileExists: jest.fn(async (p: string) => p === path),
      createModel: jest.fn(async () => realModel('treadWear')),
    });
    expect((await loadModel('treadWear', modelManifest, deps)).ok).toBe(true);
    expect(deps.createModel).toHaveBeenCalledWith(`file://${path}`, []);
  });

  test('a model missing from the bundle is asset_missing, never loaded from anywhere else', async () => {
    const deps = iosReleaseDeps('treadWear', {});
    const r = await loadModel('treadWear', modelManifest, deps);
    expect(r).toEqual({
      ok: false,
      failure: { key: 'treadWear', reason: 'asset_missing', detail: 'model file is not in the app bundle' },
    });
    expect(deps.createModel).not.toHaveBeenCalled();
  });

  test('release builds refuse a dev-server URL', async () => {
    const deps = fakeLoaderDeps({
      isDev: false,
      platform: 'ios',
      resolveAssetUri: () => 'http://localhost:8081/assets/assets/models/tread_wear.tflite',
    });
    const r = await loadModel('treadWear', modelManifest, deps);
    expect(!r.ok && r.failure.reason).toBe('load_failed');
  });
});

describe('"Analysis pending" on iOS with this build', () => {
  test('comes from the missing tread status and damage models, not from bundling', async () => {
    // The bundled model is present and loads; the analyzer still can't run.
    const deps = iosReleaseDeps('treadWear', bundled);
    const analyzer = new TfliteTyreAnalyzer(modelManifest, () => deps);
    const error = await analyzer.load().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelUnavailableError);
    const e = error as ModelUnavailableError;
    expect(e.reason).toBe('missing');
    expect(e.failures.map(f => [f.key, f.reason])).toEqual([
      ['tread', 'not_in_manifest'],
      ['damage', 'not_in_manifest'],
    ] satisfies [ModelKey, string][]);
    // The bundled model wasn't the cause: it resolves and opens on its own.
    for (const key of KEYS) {
      expect((await loadModel(key, modelManifest, iosReleaseDeps(key, bundled))).ok).toBe(true);
    }
  });
});
