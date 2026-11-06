import { TREAD_WEAR_CLASSES } from '../../config/treadWearConfig';
import { fakeDecoder } from '../../inference/__fixtures__/models';
import type { InferenceModel, LoadedModel } from '../../inference/types';
import { modelManifest, type YoloDetectorManifestEntry } from '../../manifest';
import { setTreadDebug, TREAD_LOG_TAG } from '../treadDebug';
import { TreadWearDetector, type TreadWearDetectorDeps } from '../TreadWearDetector';

const entry = modelManifest.treadWear!;
const ROWS = 18;
const ANCHORS = 1029;
const SIZE = 224;

/** One Center Wear box at the centre of the input, 0.4 × 0.2 of it. */
function oneBoxOutput(score = 0.8): ArrayBuffer {
  const t = new Float32Array(ROWS * ANCHORS);
  [0.5, 0.5, 0.4, 0.2].forEach((v, r) => (t[r * ANCHORS] = v));
  t[(4 + TREAD_WEAR_CLASSES.indexOf('Center Wear')) * ANCHORS] = score;
  return t.buffer;
}

function setup(opts: { model?: Partial<InferenceModel>; loaded?: boolean } = {}) {
  const run = jest.fn(async (_: ArrayBuffer[]) => [oneBoxOutput()]);
  const model: InferenceModel = { inputs: [], outputs: [], run, ...opts.model };
  const loaded: LoadedModel<YoloDetectorManifestEntry> = { key: 'treadWear', entry, model, delegate: 'android-gpu' };
  // 8 × 6 frame → letterboxed to 224 × 168 with 28 px of grey above and below.
  const { decoder, created } = fakeDecoder({ width: 8, height: 6 }, 255);
  const deps: TreadWearDetectorDeps = {
    loadModel: jest.fn(async () => (opts.loaded === false ? null : loaded)),
    pipeline: { resolveFramePath: p => `/app/${p}`, decoder },
  };
  return { detector: new TreadWearDetector(deps), deps, run, created, decoder };
}

describe('TreadWearDetector', () => {
  afterEach(() => setTreadDebug(false));

  test('feeds a letterboxed, planar NCHW RGB/255 tensor and decodes the output', async () => {
    const { detector, run, created, decoder } = setup();
    const outcome = await detector.scan(['frames/t1.jpg']);

    expect(decoder.loadFromFileAsync).toHaveBeenCalledWith('/app/frames/t1.jpg');
    const input = new Float32Array(run.mock.calls[0][0][0]);
    const plane = SIZE * SIZE;
    expect(input).toHaveLength(3 * plane);
    for (let c = 0; c < 3; c++) {
      expect(input[c * plane]).toBeCloseTo(114 / 255); // padding row
      expect(input[c * plane + 112 * SIZE + 112]).toBe(1); // image row
    }
    for (const img of created) expect(img.dispose).toHaveBeenCalled();

    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done') return;
    expect(outcome.delegate).toBe('android-gpu');
    const [d] = outcome.frames[0].detections;
    expect(d.label).toBe('Center Wear');
    expect(d.confidence).toBeCloseTo(0.8);
    expect(d.bbox.map(v => Number(v.toFixed(4)))).toEqual([0.3, 0.4, 0.4, 0.2]);
    // Back to the 8 × 6 frame: 224 / 8 = 28 input px per frame px, 28 px pad on y.
    expect(d.frameRect!.x).toBeCloseTo(2.4);
    expect(d.frameRect!.width).toBeCloseTo(3.2);
    expect(d.frameRect!.y).toBeCloseTo((0.4 * SIZE - 28) / 28);
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

  test('stops between frames when cancelled', async () => {
    const { detector, run } = setup();
    let cancelled = false;
    run.mockImplementationOnce(async () => {
      cancelled = true;
      return [oneBoxOutput()];
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
});
