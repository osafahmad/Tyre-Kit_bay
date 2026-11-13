import { SidewallTextDetector, type SidewallTextDetectorDeps } from '../SidewallTextDetector';
import { fakeDecoder } from '../../inference/__fixtures__/models';
import type { InferenceModel, LoadedModel } from '../../inference/types';
import type { YoloSegDetectorManifestEntry } from '../../manifest';
import { recordDebugLog, setDebugLogBuffer, getDebugLogsText, clearDebugLogs } from '../../../utils/debugLogBuffer';

// Synthetic 32 × 32 YOLO seg entry (21 anchors). Test numbers only.
const ANCHORS = 21;
const entry: YoloSegDetectorManifestEntry = {
  file: 1,
  version: 'test-seg',
  inputShape: [1, 3, 32, 32],
  inputLayout: 'NCHW',
  inputType: 'float32',
  colorOrder: 'RGB',
  resize: 'letterbox',
  letterboxPadValue: 114,
  normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
  inputQuantization: null,
  labels: ['Brand', 'DOT', 'Model', 'Size'],
  confidenceThreshold: 0.25,
  outputFormat: 'yolo_seg_raw',
  outputType: 'float32',
  outputQuantization: null,
  outputs: {
    detections: { name: 'det', shape: [1, 10, ANCHORS] },
    prototypes: { name: 'proto', shape: [1, 2, 8, 8] },
  },
  maskCoefficients: 2,
  boxFormat: 'cxcywh_normalised',
  iouThreshold: 0.45,
  maxDetections: 300,
};

/** One anchor (index 0) at the given box with a 0.9 Size score. */
function detectionsOutput(box: number[]): ArrayBuffer {
  const v = new Float32Array(10 * ANCHORS);
  box.forEach((b, i) => (v[i * ANCHORS] = b));
  v[7 * ANCHORS] = 0.9; // Size
  return v.buffer;
}
const protos = () => new Float32Array(2 * 8 * 8).fill(0.5).buffer;

function loaded(run: InferenceModel['run']): LoadedModel<YoloSegDetectorManifestEntry> {
  return {
    key: 'sidewallText',
    entry,
    delegate: 'cpu',
    model: {
      inputs: [{ name: 'in', dataType: 'float32', shape: [1, 3, 32, 32] }],
      outputs: [
        { name: 'det', dataType: 'float32', shape: [1, 10, ANCHORS] },
        { name: 'proto', dataType: 'float32', shape: [1, 2, 8, 8] },
      ],
      run,
    },
  };
}

function detector(
  model: LoadedModel<YoloSegDetectorManifestEntry> | null,
  decoderSize = { width: 64, height: 32 },
  overrides: Partial<SidewallTextDetectorDeps> = {},
) {
  const { decoder, created } = fakeDecoder(decoderSize, 200);
  let t = 1000;
  const loadModel = jest.fn(async () =>
    model
      ? ({ ok: true, model } as const)
      : ({ ok: false, failure: { key: 'sidewallText', reason: 'asset_missing', detail: 'no file' } } as const),
  );
  const d = new SidewallTextDetector({
    loadModel,
    // Like `absoluteFramePath`: demo:// frames stay as they are.
    pipeline: { resolveFramePath: p => (p.startsWith('demo://') ? p : `/docs/${p}`), decoder },
    now: () => (t += 10),
    ...overrides,
  });
  return { d, created, loadModel, decoder };
}

beforeEach(() => {
  setDebugLogBuffer(false);
  clearDebugLogs();
});

test('a frame goes through letterbox → run → decode; boxes come back in input and frame pixels with timings', async () => {
  const run = jest.fn(async () => [detectionsOutput([0.5, 0.5, 0.5, 0.25]), protos()]);
  const { d, created, loadModel } = detector(loaded(run));
  const outcome = await d.detectFrame('frames/a.jpg', 0);
  expect(outcome.status).toBe('done');
  if (outcome.status !== 'done') return;
  const r = outcome.result;
  expect(r.source).toEqual({ width: 64, height: 32 });
  expect(r.letterbox).toEqual({ sourceWidth: 64, sourceHeight: 32, scale: 0.5, padX: 0, padY: 8 });
  expect(new Float32Array((run.mock.calls[0] as unknown as [ArrayBuffer[]])[0][0]).length).toBe(3 * 32 * 32);
  expect(r.detections).toHaveLength(1);
  expect(r.detections[0]).toMatchObject({ label: 'Size', x1: 8, y1: 12, x2: 24, y2: 20 });
  expect(r.detections[0].frameRect).toEqual({ x: 16, y: 8, width: 32, height: 16 });
  expect(r.timings).toEqual({ decodeMs: expect.any(Number), inferenceMs: expect.any(Number), postMs: expect.any(Number) });
  expect(r.boxFormat).toEqual({ used: 'cxcywh_normalised', manifest: 'cxcywh_normalised', inferred: 'cxcywh_normalised', overridden: false });
  expect(r.stats.classMax).toEqual({ Brand: 0, DOT: 0, Model: 0, Size: 0.9 });
  expect(r.stats.prototypes).toEqual({ min: 0.5, max: 0.5 });
  expect(r.thresholds).toEqual({ confidence: 0.25, iou: 0.45, maxDetections: 300 });
  expect(r.tensors.outputs.map(o => o.name)).toEqual(['det', 'proto']);
  expect(r.delegate).toBe('cpu');
  expect(r.loadMs).toEqual(expect.any(Number));
  expect(created.every(img => img.dispose.mock.calls.length === 1)).toBe(true);

  // The model is loaded once.
  await d.detectFrame('frames/b.jpg', 1);
  expect(loadModel).toHaveBeenCalledTimes(1);
});

test('pixel-range boxes override a normalised manifest and are flagged, so a wrong boxFormat is visible', async () => {
  const run = jest.fn(async () => [detectionsOutput([16, 16, 16, 8]), protos()]);
  const { d } = detector(loaded(run));
  const outcome = await d.detectFrame('frames/a.jpg', 0);
  if (outcome.status !== 'done') throw new Error(outcome.status);
  expect(outcome.result.boxFormat).toEqual({
    used: 'cxcywh_pixels',
    manifest: 'cxcywh_normalised',
    inferred: 'cxcywh_pixels',
    overridden: true,
  });
  expect(outcome.result.detections[0]).toMatchObject({ x1: 8, y1: 12, x2: 24, y2: 20 });
});

test('card overrides for thresholds and box format are passed through', async () => {
  const run = jest.fn(async () => [detectionsOutput([0.5, 0.5, 0.5, 0.25]), protos()]);
  const { d } = detector(loaded(run));
  const outcome = await d.detectFrame('frames/a.jpg', 0, { confidenceThreshold: 0.95 });
  if (outcome.status !== 'done') throw new Error(outcome.status);
  expect(outcome.result.detections).toHaveLength(0);
  expect(outcome.result.thresholds.confidence).toBe(0.95);
  expect(outcome.result.stats.anchorsAboveThreshold).toBe(0);
});

test('a missing model is reported with the loader’s reason, and the load is retried next time', async () => {
  const { d, loadModel } = detector(null);
  expect(await d.detectFrame('frames/a.jpg', 0)).toEqual({
    status: 'unavailable',
    reason: 'model_missing',
    detail: 'asset_missing: no file',
  });
  expect(d.loadFailure()).toEqual({ key: 'sidewallText', reason: 'asset_missing', detail: 'no file' });
  await d.detectFrame('frames/a.jpg', 0);
  expect(loadModel).toHaveBeenCalledTimes(2);
});

test('a demo:// frame is not a file; a model that throws is a failure, not a crash', async () => {
  const run = jest.fn(async () => {
    throw new Error('interpreter died');
  });
  const { d, created } = detector(loaded(run));
  expect(await d.detectFrame('demo://sidewall/1', 0)).toMatchObject({ status: 'unavailable', reason: 'not_a_file' });
  expect(await d.detectFrame('frames/a.jpg', 1)).toEqual({ status: 'failed', error: 'interpreter died' });
  expect(created.every(img => img.dispose.mock.calls.length === 1)).toBe(true);
});

test('a model with no output is a failure', async () => {
  const run = jest.fn(async () => [] as ArrayBuffer[]);
  const { d } = detector(loaded(run));
  expect(await d.detectFrame('frames/a.jpg', 0)).toEqual({
    status: 'failed',
    error: 'The sidewall text detector returned no output.',
  });
});

test('staging buffer: per-frame lines name frames by index and carry no path', async () => {
  setDebugLogBuffer(true);
  recordDebugLog('marker');
  const run = jest.fn(async () => [detectionsOutput([0.5, 0.5, 0.5, 0.25]), protos()]);
  const { d } = detector(loaded(run));
  await d.detectFrame('frames/secret-plate.jpg', 2);
  const text = getDebugLogsText();
  expect(text).toMatch(/\[SidewallDetector\] .* frame 3: 1 detections/);
  expect(text).not.toMatch(/secret-plate/);
});
