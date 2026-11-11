import {
  checkModelMatchesManifest,
  defaultModelLoaderDeps,
  loadModel,
  loadModels,
  validateManifestEntry,
} from '../modelLoader';
import { modelManifest, type ModelManifest } from '../../manifest';
import {
  TREAD_ASSET,
  damageEntry,
  fakeLoaderDeps,
  fakeModel,
  fullManifest,
  treadEntry,
} from '../__fixtures__/models';

const mockLoadTensorflowModel = jest.fn();
let mockTfliteRequired = false;
jest.mock('react-native-fast-tflite', () => {
  mockTfliteRequired = true;
  return { loadTensorflowModel: (...args: unknown[]) => mockLoadTensorflowModel(...args) };
});

describe('validateManifestEntry', () => {
  test('a complete entry has no problems', () => {
    expect(validateManifestEntry('tread', treadEntry)).toEqual([]);
    expect(validateManifestEntry('damage', damageEntry)).toEqual([]);
  });

  test('quantized tensors need quantization values', () => {
    const p = validateManifestEntry('tread', {
      ...treadEntry,
      inputType: 'uint8',
      outputType: 'int8',
    });
    expect(p).toContain('inputQuantization is required for uint8 input');
    expect(p).toContain('outputQuantization is required for int8 output');
  });

  test('every tread label needs a status, and damage labels must exist', () => {
    expect(
      validateManifestEntry('tread', { ...treadEntry, statusByLabel: { good: 'good' } }),
    ).toEqual([
      'statusByLabel has no valid status for "soon"',
      'statusByLabel has no valid status for "now"',
    ]);
    expect(validateManifestEntry('damage', { ...damageEntry, damageLabels: ['worn'] })).toContain(
      'damage label "worn" is not in labels',
    );
    expect(
      validateManifestEntry('damage', { ...damageEntry, damageLabels: ['normal', 'cracked'] }),
    ).toContain('at least one label must mean no damage');
  });

  test('shape, normalisation and threshold are checked', () => {
    const p = validateManifestEntry('tread', {
      ...treadEntry,
      inputShape: [2, 4, 4, 1],
      normalisation: { mean: [0], std: [0, 1, 1] },
      confidenceThreshold: 1.5,
    });
    expect(p).toEqual(
      expect.arrayContaining([
        'inputShape batch must be 1',
        'inputShape must have 3 colour channels',
        'normalisation.mean needs 3 values',
        'normalisation.std needs 3 non-zero values',
        'confidenceThreshold must be between 0 and 1',
      ]),
    );
  });
});

describe('checkModelMatchesManifest', () => {
  test('flags type, shape and label count differences', () => {
    const model = fakeModel({ ...treadEntry, inputType: 'uint8', inputShape: [1, 8, 8, 3], labels: ['a', 'b'] });
    expect(checkModelMatchesManifest('tread', model, treadEntry)).toEqual([
      'input type is uint8, manifest says float32',
      'input shape is [1,8,8,3], manifest says [1,4,4,3]',
      'output has 2 values, manifest has 3 labels',
    ]);
    expect(checkModelMatchesManifest('tread', fakeModel(treadEntry), treadEntry)).toEqual([]);
  });
});

describe('loadModel', () => {
  test('the shipped manifest has no models yet, and that is reported, not thrown', async () => {
    const deps = fakeLoaderDeps();
    const r = await loadModels(['tread', 'damage'], modelManifest, deps);
    expect(r.models).toEqual({});
    expect(r.failures.map(f => [f.key, f.reason])).toEqual([
      ['tread', 'not_in_manifest'],
      ['damage', 'not_in_manifest'],
    ]);
    expect(deps.createModel).not.toHaveBeenCalled();
  });

  test('an incomplete manifest entry never reaches TFLite', async () => {
    const deps = fakeLoaderDeps();
    const manifest: ModelManifest = { ...fullManifest, tread: { ...treadEntry, labels: [] } };
    const r = await loadModel('tread', manifest, deps);
    expect(r).toMatchObject({ ok: false, failure: { reason: 'invalid_manifest' } });
    expect(deps.createModel).not.toHaveBeenCalled();
  });

  test('iOS release: loads a bundled file and records the delegate', async () => {
    const deps = fakeLoaderDeps({ acceleration: ['core-ml'] });
    const r = await loadModel('tread', fullManifest, deps);
    expect(r.ok && r.model.delegate).toBe('core-ml');
    expect(deps.fileExists).toHaveBeenCalledWith('/bundle/tread.tflite');
    expect(deps.createModel).toHaveBeenCalledWith('file:///bundle/tread.tflite', ['core-ml']);
  });

  test('a bundled file that is missing on disk is reported as asset_missing', async () => {
    const deps = fakeLoaderDeps({ fileExists: jest.fn(async () => false) });
    const r = await loadModel('tread', fullManifest, deps);
    expect(r).toMatchObject({ ok: false, failure: { key: 'tread', reason: 'asset_missing' } });
    expect(deps.createModel).not.toHaveBeenCalled();
  });

  test('an asset that cannot be resolved is asset_missing', async () => {
    const deps = fakeLoaderDeps({
      resolveAssetUri: () => {
        throw new Error('unknown asset');
      },
    });
    expect(await loadModel('tread', fullManifest, deps)).toMatchObject({
      ok: false,
      failure: { reason: 'asset_missing' },
    });
  });

  test('Android release: copies the raw resource to cache and opens it from there', async () => {
    const opened = fakeModel(treadEntry);
    const deps = fakeLoaderDeps({
      platform: 'android',
      resolveAssetUri: () => 'assets_models_tread_model_int8',
      createModel: jest.fn(async () => opened),
    });
    const r = await loadModel('tread', fullManifest, deps);
    expect(r.ok).toBe(true);
    expect(deps.resourceExists).toHaveBeenCalledWith('assets_models_tread_model_int8.tflite');
    expect(deps.mkdir).toHaveBeenCalledWith('/caches/models');
    expect(deps.copyResource).toHaveBeenCalledWith(
      'assets_models_tread_model_int8.tflite',
      '/caches/models/assets_models_tread_model_int8.tflite',
    );
    expect(deps.createModel).toHaveBeenCalledWith(
      'file:///caches/models/assets_models_tread_model_int8.tflite',
      [],
    );
  });

  test('Android release: a missing raw resource is asset_missing and nothing is copied', async () => {
    const deps = fakeLoaderDeps({
      platform: 'android',
      resolveAssetUri: () => 'assets_models_tread_model_int8',
      resourceExists: jest.fn(async () => false),
    });
    expect(await loadModel('tread', fullManifest, deps)).toMatchObject({
      ok: false,
      failure: { reason: 'asset_missing' },
    });
    expect(deps.copyResource).not.toHaveBeenCalled();
  });

  test('Metro URLs are used in development only; release never loads over the network', async () => {
    const url = 'http://localhost:8081/assets/assets/models/tread_model_int8.tflite';
    const opened = fakeModel(treadEntry);
    const dev = fakeLoaderDeps({ isDev: true, resolveAssetUri: () => url, createModel: jest.fn(async () => opened) });
    expect((await loadModel('tread', fullManifest, dev)).ok).toBe(true);
    expect(dev.createModel).toHaveBeenCalledWith(url, []);

    const release = fakeLoaderDeps({ isDev: false, resolveAssetUri: () => url });
    expect(await loadModel('tread', fullManifest, release)).toMatchObject({
      ok: false,
      failure: { reason: 'load_failed' },
    });
    expect(release.createModel).not.toHaveBeenCalled();
  });

  test('falls back to CPU when every accelerated delegate fails', async () => {
    const opened = fakeModel(treadEntry);
    const createModel = jest.fn(async (_url: string, delegates: string[]) => {
      if (delegates.length > 0) throw new Error('delegate not supported');
      return opened;
    });
    const deps = fakeLoaderDeps({ acceleration: ['android-gpu', 'nnapi'], createModel });
    const r = await loadModel('tread', fullManifest, deps);
    expect(r.ok && r.model.delegate).toBe('cpu');
    expect(createModel.mock.calls.map(c => c[1])).toEqual([['android-gpu'], ['nnapi'], []]);
  });

  test('diagnostics: logs each delegate tried, the fallback and the allocated tensors', async () => {
    const log = jest.fn();
    const opened = fakeModel(treadEntry);
    const createModel = jest.fn(async (_url: string, delegates: string[]) => {
      if (delegates.length > 0) throw new Error('Core ML delegate unavailable');
      return opened;
    });
    const deps = fakeLoaderDeps({ acceleration: ['core-ml'], createModel, log });
    const r = await loadModel('tread', fullManifest, deps);
    expect(r.ok).toBe(true);
    const messages = log.mock.calls.map(c => c[0]);
    expect(messages).toEqual([
      'opening model with core-ml delegate',
      'core-ml delegate failed, trying the next',
      'opening model on CPU',
      'CPU opened',
      'tensors allocated',
    ]);
    expect(log.mock.calls[1][1]).toEqual(expect.objectContaining({ error: 'Core ML delegate unavailable' }));
    expect(log.mock.calls[4][1]).toEqual(
      expect.objectContaining({ delegate: 'cpu', inputs: [expect.objectContaining({ shape: expect.any(Array) })] }),
    );
  });

  test('a file TFLite cannot open is load_failed', async () => {
    const deps = fakeLoaderDeps({
      createModel: jest.fn(async () => {
        throw new Error('not a flatbuffer');
      }),
    });
    expect(await loadModel('tread', fullManifest, deps)).toMatchObject({
      ok: false,
      failure: { reason: 'load_failed', detail: 'not a flatbuffer' },
    });
  });

  test('a model that does not match its manifest is rejected', async () => {
    const wrong = fakeModel({ ...treadEntry, inputShape: [1, 224, 224, 3] });
    const deps = fakeLoaderDeps({ createModel: jest.fn(async () => wrong) });
    expect(await loadModel('tread', fullManifest, deps)).toMatchObject({
      ok: false,
      failure: { reason: 'manifest_mismatch' },
    });
  });

  test('loadModels returns what loaded alongside every failure', async () => {
    const deps = fakeLoaderDeps({
      resolveAssetUri: f => (f === TREAD_ASSET ? 'file:///bundle/tread.tflite' : null),
    });
    const r = await loadModels(['tread', 'damage'], fullManifest, deps);
    expect(r.models.tread?.entry.version).toBe('test-tread-1');
    expect(r.models.damage).toBeUndefined();
    expect(r.failures).toEqual([
      { key: 'damage', reason: 'asset_missing', detail: 'asset could not be resolved' },
    ]);
  });
});

describe('default deps', () => {
  test('fast-tflite is only required when a model is opened, and gets a URL source', async () => {
    const deps = defaultModelLoaderDeps();
    expect(mockTfliteRequired).toBe(false);
    const model = fakeModel(treadEntry);
    mockLoadTensorflowModel.mockResolvedValueOnce(model);
    await expect(deps.createModel('file:///x.tflite', [])).resolves.toBe(model);
    expect(mockTfliteRequired).toBe(true);
    expect(mockLoadTensorflowModel).toHaveBeenCalledWith({ url: 'file:///x.tflite' }, []);
  });

  test('tries the platform delegate first', () => {
    // Jest's react-native preset runs as iOS.
    expect(defaultModelLoaderDeps().acceleration).toEqual(['core-ml']);
  });
});
