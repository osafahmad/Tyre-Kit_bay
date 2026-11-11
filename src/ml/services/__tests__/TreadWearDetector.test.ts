import { fakeDecoder } from '../../inference/__fixtures__/models';
import { anchorIndex, ssdOutputs } from '../../inference/__fixtures__/ssdOutputs';
import type { InferenceModel, LoadedModel } from '../../inference/types';
import { modelManifest, type SsdDetectorManifestEntry } from '../../manifest';
import { setTreadDebug, TREAD_LOG_TAG } from '../treadDebug';
import { rawClassMaxScores, TreadWearDetector, type TreadWearDetectorDeps } from '../TreadWearDetector';

const entry = modelManifest.treadWear!;
const SIZE = 320;

/** One center_wear box on the level-0 anchor at cell (10, 10): 0.425–0.625 of the input. */
function oneBoxOutputs(score = 0.8): ArrayBuffer[] {
  const { boxes, scores } = ssdOutputs(entry, [
    { anchor: anchorIndex(entry, 0, 10, 10), scores: { [entry.labels.indexOf('center_wear')]: score } },
  ]);
  return [boxes.buffer as ArrayBuffer, scores.buffer as ArrayBuffer];
}

function setup(opts: { model?: Partial<InferenceModel>; loaded?: boolean } = {}) {
  const run = jest.fn(async (_: ArrayBuffer[]) => oneBoxOutputs());
  const model: InferenceModel = { inputs: [], outputs: [], run, ...opts.model };
  const loaded: LoadedModel<SsdDetectorManifestEntry> = { key: 'treadWear', entry, model, delegate: 'android-gpu' };
  // 8 × 6 frame → stretched to 320 × 320 (no padding).
  const { decoder, created } = fakeDecoder({ width: 8, height: 6 }, 255);
  const deps: TreadWearDetectorDeps = {
    loadModel: jest.fn(async () => (opts.loaded === false ? null : loaded)),
    pipeline: { resolveFramePath: p => `/app/${p}`, decoder },
  };
  return { detector: new TreadWearDetector(deps), deps, run, created, decoder };
}

describe('TreadWearDetector', () => {
  afterEach(() => setTreadDebug(false));

  test('feeds a stretched, interleaved NHWC RGB/255 tensor and decodes both outputs', async () => {
    const { detector, run, created, decoder } = setup();
    const outcome = await detector.scan(['frames/t1.jpg']);

    expect(decoder.loadFromFileAsync).toHaveBeenCalledWith('/app/frames/t1.jpg');
    const resized = created[0].resizeAsync as jest.Mock;
    expect(resized).toHaveBeenCalledWith(SIZE, SIZE); // stretch, no letterbox
    const input = new Float32Array(run.mock.calls[0][0][0]);
    expect(input).toHaveLength(SIZE * SIZE * 3);
    expect(input.every(v => v === 1)).toBe(true); // every pixel is image, none is padding
    for (const img of created) expect(img.dispose).toHaveBeenCalled();

    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done') return;
    expect(outcome.delegate).toBe('android-gpu');
    expect(outcome.modelVersion).toBe(entry.version);
    const [d] = outcome.frames[0].detections;
    expect(d.label).toBe('center_wear');
    expect(d.confidence).toBeCloseTo(0.8);
    expect(d.bbox.map(v => Number(v.toFixed(4)))).toEqual([0.425, 0.425, 0.2, 0.2]);
    // Back to the 8 × 6 frame: x and y scale separately (plain stretch).
    expect(d.frameRect!.x).toBeCloseTo(0.425 * 8);
    expect(d.frameRect!.width).toBeCloseTo(0.2 * 8);
    expect(d.frameRect!.y).toBeCloseTo(0.425 * 6);
    expect(d.frameRect!.height).toBeCloseTo(0.2 * 6);
  });

  test('a model run with only one output is a failed frame, not an empty result', async () => {
    const { detector, run } = setup();
    run.mockResolvedValue([oneBoxOutputs()[0]]);
    expect(await detector.scan(['a.jpg'])).toEqual({ status: 'unavailable', reason: 'unreadable' });
  });

  test('only demo or no frames: unavailable, model never loaded', async () => {
    const { detector, deps } = setup();
    expect(await detector.scan([])).toEqual({ status: 'unavailable', reason: 'no_frames' });
    expect(await detector.scan(['demo://tread/1'])).toEqual({ status: 'unavailable', reason: 'no_frames' });
    expect(deps.loadModel).not.toHaveBeenCalled();
  });

  test('model missing: unavailable, and the load is retried next time', async () => {
    const { detector, deps } = setup({ loaded: false });
    expect(await detector.scan(['a.jpg'])).toEqual({ status: 'unavailable', reason: 'model_missing' });
    await detector.scan(['a.jpg']);
    expect(deps.loadModel).toHaveBeenCalledTimes(2);
  });

  test('a failing frame is skipped and counted, not guessed', async () => {
    const { detector, run } = setup();
    run.mockRejectedValueOnce(new Error('delegate error'));
    const outcome = await detector.scan(['a.jpg', 'b.jpg']);
    expect(outcome).toEqual(expect.objectContaining({ status: 'done', framesFailed: 1 }));
    if (outcome.status === 'done') expect(outcome.frames.map(f => f.frame)).toEqual(['b.jpg']);
  });

  test('every frame failing is unavailable (unreadable), never an empty result', async () => {
    const { detector, run } = setup();
    run.mockRejectedValue(new Error('file missing'));
    expect(await detector.scan(['a.jpg', 'b.jpg'])).toEqual({ status: 'unavailable', reason: 'unreadable' });
  });

  test('stops between frames when cancelled', async () => {
    const { detector, run } = setup();
    let cancelled = false;
    run.mockImplementationOnce(async () => {
      cancelled = true;
      return oneBoxOutputs();
    });
    expect(await detector.scan(['a.jpg', 'b.jpg'], () => cancelled)).toEqual({ status: 'cancelled' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('logs only when setTreadDebug(true)', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await setup().detector.scan(['a.jpg']);
    expect(log).not.toHaveBeenCalled();
    setTreadDebug(true);
    await setup().detector.scan(['a.jpg']);
    expect(log.mock.calls.some(c => String(c[0]).startsWith(TREAD_LOG_TAG))).toBe(true);
    log.mockRestore();
  });

  test('debug logs cover scan start, model load, per-frame scores and boxes, with a timestamp and no frame paths', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    setTreadDebug(true);
    await setup().detector.scan(['frames/t1.jpg', 'demo://tread/1']);
    const lines = log.mock.calls.map(c => c.map(String).join(' '));
    log.mockRestore();
    for (const line of lines) expect(line).toMatch(/^\[TreadWear\] \d\d:\d\d:\d\d\.\d{3} /);
    expect(lines.find(l => l.includes('scan started'))).toContain('"savedFrames":2,"realFrames":1');
    expect(lines.some(l => l.includes('model loaded (delegate android-gpu)'))).toBe(true);
    const frame = lines.find(l => l.includes('frame inference'))!;
    const data = JSON.parse(frame.slice(frame.indexOf('{')));
    expect(data.detections).toEqual([
      { label: 'center_wear', confidence: 0.8, bbox: expect.arrayContaining([expect.any(Number)]) },
    ]);
    expect(data.detections[0].bbox).toHaveLength(4);
    expect(data.rawMaxScore.center_wear).toBeCloseTo(0.8, 3);
    expect(typeof data.inferenceMs).toBe('number');
    expect(lines.some(l => l.includes('scan done'))).toBe(true);
    // Frames are referred to by index only.
    expect(lines.join('\n')).not.toContain('t1.jpg');
  });
});

test('rawClassMaxScores: highest raw score per class over all anchors', () => {
  const [, scores] = oneBoxOutputs(0.7);
  const max = rawClassMaxScores(scores, entry)!;
  expect(Object.keys(max)).toEqual(entry.labels);
  expect(max.center_wear).toBeCloseTo(0.7, 3);
  expect(rawClassMaxScores(new ArrayBuffer(8), entry)).toBeNull();
});
