import { AnalysisFailedError, classifyFrames, runTyrePipeline, type PipelineDeps } from '../pipeline';
import type { AnalysisModels, LoadedModel } from '../types';
import type { ClassifierManifestEntry } from '../../manifest';
import { damageEntry, fakeDecoder, fakeModel, treadEntry } from '../__fixtures__/models';

function setup(treadScores: number[][], damageScores: number[][]) {
  const { decoder, created } = fakeDecoder({ width: 4, height: 4 });
  const deps: PipelineDeps = { resolveFramePath: p => `/docs/${p}`, decoder };
  const treadModel = fakeModel(treadEntry, treadScores);
  const damageModel = fakeModel(damageEntry, damageScores);
  const models: AnalysisModels = {
    tread: { key: 'tread', entry: treadEntry, delegate: 'cpu', model: treadModel },
    damage: { key: 'damage', entry: damageEntry, delegate: 'cpu', model: damageModel },
  };
  return { deps, models, decoder, created, treadModel, damageModel };
}

const input = {
  sidewallFrames: ['s1.jpg', 's2.jpg'],
  treadFrames: ['t1.jpg', 't2.jpg', 't3.jpg'],
  userDetails: { size: '215/65r15', dotTin: null, make: 'Brand', model: null },
};

test('runs sidewall → tread → damage on the right frames and combines a result', async () => {
  const { deps, models, decoder, created, treadModel, damageModel } = setup(
    [[0.9, 0.1, 0]],
    [[0.95, 0.05]],
  );
  const steps: string[] = [];
  const result = await runTyrePipeline(models, input, s => steps.push(s), deps);

  expect(steps).toEqual(['sidewall', 'tread', 'damage']);
  // Tread model sees tread frames only; damage (trained on sidewall) sees sidewall frames.
  expect(treadModel.run).toHaveBeenCalledTimes(3);
  expect(damageModel.run).toHaveBeenCalledTimes(2);
  expect(decoder.loadFromFileAsync.mock.calls.map(c => c[0])).toEqual([
    '/docs/t1.jpg',
    '/docs/t2.jpg',
    '/docs/t3.jpg',
    '/docs/s1.jpg',
    '/docs/s2.jpg',
  ]);
  for (const img of created) expect(img.dispose).toHaveBeenCalled();

  expect(result).toEqual({
    status: 'good',
    treadDepthMm: null, // never reported until a validated mm output exists
    treadConfidence: expect.closeTo(0.9),
    wearPattern: null,
    damageFound: false,
    damageConfidence: expect.closeTo(0.95),
    size: '215/65 R15',
    rimInches: 15,
    make: 'Brand',
    model: null,
    dotTin: null,
    ageYears: null,
    ageMonths: null,
  });
});

test('scores are averaged across frames before picking a class', async () => {
  // Frame 1 says good, frames 2–3 say replace soon: the average says replace soon.
  const { deps, models } = setup(
    [
      [0.9, 0.1, 0],
      [0.1, 0.8, 0.1],
      [0.1, 0.8, 0.1],
    ],
    [[1, 0]],
  );
  const result = await runTyrePipeline(models, input, () => {}, deps);
  expect(result.status).toBe('replace_soon');
  expect(result.treadConfidence).toBeCloseTo((0.1 + 0.8 + 0.8) / 3);
});

test('damage at or above the threshold raises the status to at least replace soon', async () => {
  const { deps, models } = setup([[1, 0, 0]], [[0.3, 0.7]]);
  const result = await runTyrePipeline(models, input, () => {}, deps);
  expect(result.damageFound).toBe(true);
  expect(result.damageConfidence).toBeCloseTo(0.7);
  expect(result.status).toBe('replace_soon');
});

test('a tread result below the confidence threshold fails instead of guessing', async () => {
  const { deps, models } = setup([[0.4, 0.35, 0.25]], [[1, 0]]);
  const steps: string[] = [];
  await expect(runTyrePipeline(models, input, s => steps.push(s), deps)).rejects.toBeInstanceOf(
    AnalysisFailedError,
  );
  expect(steps).toEqual(['sidewall', 'tread']);
});

test('demo frames are not real files and are refused', async () => {
  const { models, decoder } = setup([[1, 0, 0]], [[1, 0]]);
  const deps: PipelineDeps = { resolveFramePath: p => p, decoder };
  await expect(
    runTyrePipeline(models, { ...input, treadFrames: ['demo://tread/1'] }, () => {}, deps),
  ).rejects.toThrow('Frame is not a saved file on this phone.');
  expect(decoder.loadFromFileAsync).not.toHaveBeenCalled();
});

test('file:// frame paths are passed to the decoder as plain paths', async () => {
  const { models, decoder } = setup([[1, 0, 0]], [[1, 0]]);
  const deps: PipelineDeps = { resolveFramePath: p => `file:///docs/my%20frames/${p}`, decoder };
  await runTyrePipeline(models, input, () => {}, deps);
  expect(decoder.loadFromFileAsync).toHaveBeenCalledWith('/docs/my frames/t1.jpg');
});

test('no frames for a model is an analysis failure', async () => {
  const { models, deps } = setup([[1, 0, 0]], [[1, 0]]);
  await expect(classifyFrames(models.tread, [], deps)).rejects.toBeInstanceOf(AnalysisFailedError);
});

test('quantized uint8 outputs are dequantized with the manifest values', async () => {
  const entry: ClassifierManifestEntry = {
    ...treadEntry,
    outputType: 'uint8',
    outputQuantization: { scale: 1 / 255, zeroPoint: 0 },
  };
  const model = fakeModel({ ...entry, outputType: 'uint8' });
  model.run.mockResolvedValue([new Uint8Array([51, 204, 0]).buffer]);
  const loaded: LoadedModel = { key: 'tread', entry, model, delegate: 'cpu' };
  const { deps } = setup([[1, 0, 0]], [[1, 0]]);
  const out = await classifyFrames(loaded, ['t1.jpg'], deps);
  expect(out.topLabel).toBe('soon');
  expect(out.topScore).toBeCloseTo(0.8);
});

test('the input tensor sent to the model matches the manifest', async () => {
  const { deps, models, treadModel } = setup([[1, 0, 0]], [[1, 0]]);
  await classifyFrames(models.tread, ['t1.jpg'], deps);
  const [[tensor]] = treadModel.run.mock.calls[0] as [ArrayBuffer[]];
  const values = new Float32Array(tensor);
  expect(values).toHaveLength(4 * 4 * 3);
  // Solid white frame normalised with std 255 → every value is 1.
  expect(values.every(v => v === 1)).toBe(true);
});

test('the sidewall step runs no model: values come only from what the user confirmed', async () => {
  const { deps, models, treadModel } = setup([[0.9, 0.1, 0]], [[0.95, 0.05]]);
  const result = await runTyrePipeline(models, input, () => {}, deps);
  expect(treadModel.run).toHaveBeenCalledTimes(input.treadFrames.length);
  expect(result).toMatchObject({ size: '215/65 R15', make: 'Brand', model: null, dotTin: null });
});
