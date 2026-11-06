import { createAnalyzer } from '..';
import { DemoTyreAnalyzer } from '../demoAnalyzer';
import { TfliteTyreAnalyzer } from '../tfliteAnalyzer';
import { AnalyzerUnavailableError } from '../analyzer';

test('release builds never get the demo analyzer', () => {
  const analyzer = createAnalyzer(false);
  expect(analyzer).toBeInstanceOf(TfliteTyreAnalyzer);
  expect(analyzer.isDemo).toBe(false);
});

test('demo analyzer cannot load in release mode', async () => {
  await expect(new DemoTyreAnalyzer(false).load()).rejects.toBeInstanceOf(AnalyzerUnavailableError);
  await expect(
    new DemoTyreAnalyzer(false, 0).analyse(
      { sidewallFrames: [], treadFrames: [], userDetails: {} },
      () => {},
    ),
  ).rejects.toBeInstanceOf(AnalyzerUnavailableError);
});

test('real analyzer fails clearly while models are missing', async () => {
  await expect(new TfliteTyreAnalyzer().load()).rejects.toThrow(/models are missing/);
});

test('development builds use the demo analyzer, flagged as demo', () => {
  const analyzer = createAnalyzer(true);
  expect(analyzer.isDemo).toBe(true);
  expect(analyzer.version).toMatch(/^demo/);
});

test('demo analyzer only uses sidewall values the user confirmed', async () => {
  const steps: string[] = [];
  const result = await new DemoTyreAnalyzer(true, 0).analyse(
    { sidewallFrames: [], treadFrames: [], userDetails: { size: '215/65r15', dotTin: null } },
    s => steps.push(s),
  );
  expect(steps).toEqual(['sidewall', 'tread', 'damage']);
  expect(result.size).toBe('215/65 R15');
  expect(result.rimInches).toBe(15);
  expect(result.make).toBeNull();
  expect(result.dotTin).toBeNull();
  expect(result.ageYears).toBeNull();
});

describe('TfliteTyreAnalyzer with the inference layer', () => {
  // Test-only manifest and fake TFLite bindings; see __fixtures__/models.ts.
  const {
    fullManifest,
    fakeLoaderDeps,
    fakeDecoder,
  } = require('../inference/__fixtures__/models') as typeof import('../inference/__fixtures__/models');
  const { ModelUnavailableError } = require('../analyzer') as typeof import('../analyzer');
  const { modelManifest } = require('../manifest') as typeof import('../manifest');

  const input = { sidewallFrames: ['s1.jpg'], treadFrames: ['t1.jpg'], userDetails: {} };
  const pipelineDeps = () => ({ resolveFramePath: (p: string) => `/docs/${p}`, decoder: fakeDecoder({ width: 4, height: 4 }).decoder });

  test('the shipped build has no models: reason "missing", still an AnalyzerUnavailableError', async () => {
    const a = new TfliteTyreAnalyzer(modelManifest, () => fakeLoaderDeps());
    expect(a.version).toBe('tflite-unconfigured');
    const err = await a.load().catch(e => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect(err).toBeInstanceOf(AnalyzerUnavailableError);
    expect(err.reason).toBe('missing');
    await expect(a.analyse(input, () => {})).rejects.toBeInstanceOf(AnalyzerUnavailableError);
  });

  test('a manifest entry whose file is not bundled is reported as missing', async () => {
    const deps = fakeLoaderDeps({ fileExists: jest.fn(async () => false) });
    const err = await new TfliteTyreAnalyzer(fullManifest, () => deps).load().catch(e => e);
    expect(err.reason).toBe('missing');
  });

  test('a bundled model that will not open is "load_failed" and can be retried', async () => {
    const deps = fakeLoaderDeps();
    const working = deps.createModel.getMockImplementation()!;
    deps.createModel.mockRejectedValueOnce(new Error('bad file'));
    const a = new TfliteTyreAnalyzer(fullManifest, () => deps, pipelineDeps);
    const err = await a.load().catch(e => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect(err.reason).toBe('load_failed');

    deps.createModel.mockImplementation(working);
    await expect(a.load()).resolves.toBeUndefined();
  });

  test('with models present it runs the pipeline and is not demo', async () => {
    const a = new TfliteTyreAnalyzer(fullManifest, () => fakeLoaderDeps(), pipelineDeps);
    expect(a.isDemo).toBe(false);
    expect(a.version).toBe('tflite:tread@test-tread-1,damage@test-damage-1');
    const steps: string[] = [];
    const result = await a.analyse(input, s => steps.push(s));
    expect(steps).toEqual(['sidewall', 'tread', 'damage']);
    expect(result.status).toBe('good');
    expect(result.treadDepthMm).toBeNull();
  });

  test('models load once and are reused', async () => {
    const deps = fakeLoaderDeps();
    const a = new TfliteTyreAnalyzer(fullManifest, () => deps, pipelineDeps);
    await Promise.all([a.load(), a.load()]);
    await a.analyse(input, () => {});
    expect(deps.createModel).toHaveBeenCalledTimes(2); // tread + damage, once each
  });

  test('development builds switch to the real analyzer once models are in the manifest', () => {
    expect(createAnalyzer(true, fullManifest)).toBeInstanceOf(TfliteTyreAnalyzer);
    expect(createAnalyzer(true, modelManifest)).toBeInstanceOf(DemoTyreAnalyzer);
    expect(createAnalyzer(false, modelManifest)).toBeInstanceOf(TfliteTyreAnalyzer);
  });
});

describe('TfliteTyreAnalyzer and the optional sidewall text detector', () => {
  const { fullManifest, fakeLoaderDeps, fakeDecoder } =
    require('../inference/__fixtures__/models') as typeof import('../inference/__fixtures__/models');
  const { modelManifest } = require('../manifest') as typeof import('../manifest');
  const textEntry = modelManifest.sidewallTextDetector!;
  const textModel = {
    inputs: [{ name: 'in', dataType: 'float32', shape: textEntry.inputShape }],
    outputs: [{ name: 'out', dataType: 'float32', shape: textEntry.outputShape }],
    run: jest.fn(async () => [new Float32Array(8 * textEntry.outputShape[2]).buffer]),
  };
  const input = { sidewallFrames: ['s1.jpg'], treadFrames: ['t1.jpg'], userDetails: {} };

  function depsWithText() {
    const base = fakeLoaderDeps();
    const resolve = base.resolveAssetUri;
    const create = base.createModel.getMockImplementation()!;
    return fakeLoaderDeps({
      resolveAssetUri: f => (f === textEntry.file ? 'file:///bundle/text.tflite' : resolve(f)),
      createModel: jest.fn(async (url: string, d: never[]) =>
        url === 'file:///bundle/text.tflite' ? textModel : create(url, d),
      ),
    });
  }

  test('is loaded and run on sidewall frames when it is in the manifest', async () => {
    const deps = depsWithText();
    const onSidewallTextRegions = jest.fn();
    const a = new TfliteTyreAnalyzer({ ...fullManifest, sidewallTextDetector: textEntry }, () => deps, () => ({
      resolveFramePath: (p: string) => `/docs/${p}`,
      decoder: fakeDecoder({ width: 4, height: 4 }).decoder,
      onSidewallTextRegions,
    }));
    const result = await a.analyse(input, () => {});
    expect(deps.createModel).toHaveBeenCalledTimes(3);
    expect(textModel.run).toHaveBeenCalledTimes(1);
    expect(onSidewallTextRegions).toHaveBeenCalledWith([]); // all-zero output: nothing above threshold
    expect(result.status).toBe('good');
  });

  test('analysis still runs when it is missing from the manifest', async () => {
    const deps = fakeLoaderDeps();
    const a = new TfliteTyreAnalyzer(fullManifest, () => deps, () => ({
      resolveFramePath: (p: string) => `/docs/${p}`,
      decoder: fakeDecoder({ width: 4, height: 4 }).decoder,
    }));
    await expect(a.analyse(input, () => {})).resolves.toMatchObject({ status: 'good' });
    expect(deps.createModel).toHaveBeenCalledTimes(2);
  });
});
