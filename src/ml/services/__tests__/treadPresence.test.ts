import { treadPresenceConfig } from '../../../config/capture';
import type { DecodableImage, ImageDecoder } from '../../inference/tensorUtils';
import type { RawPixels } from '../../inference/types';
import {
  blocksTreadResult,
  combineTreadJudgements,
  judgeTreadFrame,
  spreadIndexes,
  TreadPresenceValidator,
  treadPresenceMetrics,
} from '../treadPresence';
import { setDebugLogBuffer, getDebugLogsText, clearDebugLogs } from '../../../utils/debugLogBuffer';

// Synthetic surfaces, 64 × 48 RGBA. Values are made up to be clearly tread-like
// or clearly not; the thresholds themselves are the config's (uncalibrated).

type Paint = (x: number, y: number) => [number, number, number];

function image(paint: Paint, width = 64, height = 48, format: 'RGBA' | 'BGRA' = 'RGBA'): RawPixels {
  const b = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, cb] = paint(x, y);
      const o = (y * width + x) * 4;
      if (format === 'RGBA') b.set([r, g, cb, 255], o);
      else b.set([cb, g, r, 255], o);
    }
  }
  return { buffer: b.buffer, width, height, pixelFormat: format };
}

/** Charcoal rubber with a dark groove every 8 columns (ribs run top to bottom). */
const grooved: Paint = x => (x % 8 < 3 ? [22, 22, 24] : [72, 72, 74]);
/** The same grooves running left to right. */
const groovedAcross: Paint = (_x, y) => (y % 8 < 3 ? [22, 22, 24] : [72, 72, 74]);
/** A white wall. */
const wall: Paint = () => [205, 203, 200];
/** A dark grey floor with faint noise, no grooves. */
const floor: Paint = (x, y) => {
  const n = ((x * 7 + y * 13) % 5) - 2;
  return [90 + n, 90 + n, 92 + n];
};
/** A red object with texture. */
const redTextured: Paint = x => (x % 6 < 2 ? [150, 30, 30] : [220, 60, 60]);
/** Rubber with heavy glare on the top half. */
const glare: Paint = (x, y) => (y < 30 ? [250, 250, 250] : grooved(x, y));

describe('treadPresenceMetrics', () => {
  test('grooved rubber: dark, unsaturated, strong edges along the groove axis only', () => {
    const m = treadPresenceMetrics(image(grooved));
    expect(m.medianLuminance).toBeCloseTo(72, 0);
    expect(m.medianSaturation).toBeLessThan(0.05);
    expect(m.blownOutFraction).toBe(0);
    // Two transitions per 8 columns: 2/8 of horizontal pairs are edges of 50.
    expect(m.strongEdgeFractionX).toBeCloseTo(0.25, 1);
    expect(m.strongEdgeFractionY).toBe(0);
    expect(m.meanGradientX).toBeGreaterThan(10);
    expect(m.meanGradientY).toBe(0);
  });

  test('the same frame as BGRA gives the same numbers (channel order is read from the format)', () => {
    expect(treadPresenceMetrics(image(redTextured, 64, 48, 'BGRA'))).toEqual(treadPresenceMetrics(image(redTextured)));
  });

  test('a wall: bright and smooth', () => {
    const m = treadPresenceMetrics(image(wall));
    expect(m.medianLuminance).toBeGreaterThan(190);
    expect(m.strongEdgeFractionX).toBe(0);
    expect(m.strongEdgeFractionY).toBe(0);
  });

  test('a red object: high saturation', () => {
    expect(treadPresenceMetrics(image(redTextured)).medianSaturation).toBeGreaterThan(0.6);
  });

  test('glare: most pixels blown out', () => {
    expect(treadPresenceMetrics(image(glare)).blownOutFraction).toBeCloseTo(30 / 48, 2);
  });
});

describe('judgeTreadFrame', () => {
  const judge = (paint: Paint) => judgeTreadFrame(0, treadPresenceMetrics(image(paint)));

  test('grooved tread passes, whichever way the grooves run', () => {
    expect(judge(grooved)).toMatchObject({ rubber: true, grooves: true, reason: 'ok' });
    expect(judge(groovedAcross)).toMatchObject({ rubber: true, grooves: true, reason: 'ok' });
  });

  test('a wall is not rubber (too bright); a dark floor is rubber-coloured but has no grooves', () => {
    expect(judge(wall)).toMatchObject({ rubber: false, reason: 'not_rubber_surface' });
    expect(judge(floor)).toMatchObject({ rubber: true, grooves: false, reason: 'too_smooth_no_grooves' });
  });

  test('a coloured object and a glare-filled frame are not rubber', () => {
    expect(judge(redTextured).reason).toBe('not_rubber_surface');
    expect(judge(glare).reason).toBe('not_rubber_surface');
  });

  test('thresholds come from the config and can be tightened', () => {
    const strict = { ...treadPresenceConfig, minStrongEdgeFraction: 0.5 };
    expect(judgeTreadFrame(0, treadPresenceMetrics(image(grooved)), strict).reason).toBe('too_smooth_no_grooves');
  });
});

describe('combineTreadJudgements and blocksTreadResult', () => {
  const j = (reason: 'ok' | 'too_smooth_no_grooves' | 'not_rubber_surface', index = 0) => ({
    index,
    metrics: treadPresenceMetrics(image(grooved)),
    rubber: reason !== 'not_rubber_surface',
    grooves: reason === 'ok',
    reason,
  });

  test('fewer than minFrames readable: insufficient_frames, which never blocks', () => {
    const v = combineTreadJudgements([j('ok'), j('ok', 1)], [2, 3]);
    expect(v).toMatchObject({ isTyreTread: false, confidence: 0, reason: 'insufficient_frames' });
    expect(v.metrics).toMatchObject({ framesChecked: 4, framesReadable: 2, framesPassed: 2, unreadable: [2, 3] });
    expect(blocksTreadResult(v)).toBe(false);
  });

  test('at least half the frames tread-like: tread, with the pass fraction as confidence', () => {
    const v = combineTreadJudgements([j('ok'), j('ok', 1), j('too_smooth_no_grooves', 2)], []);
    expect(v).toMatchObject({ isTyreTread: true, reason: 'ok' });
    expect(v.confidence).toBeCloseTo(2 / 3);
    expect(blocksTreadResult(v)).toBe(false);
  });

  test('mostly failing: the most common failure is the reason, and it blocks', () => {
    const smooth = combineTreadJudgements([j('ok'), j('too_smooth_no_grooves', 1), j('too_smooth_no_grooves', 2)], []);
    expect(smooth).toMatchObject({ isTyreTread: false, reason: 'too_smooth_no_grooves' });
    expect(smooth.confidence).toBeCloseTo(1 / 3);
    expect(blocksTreadResult(smooth)).toBe(true);
    const bright = combineTreadJudgements([j('not_rubber_surface'), j('too_smooth_no_grooves', 1), j('not_rubber_surface', 2)], []);
    expect(bright.reason).toBe('not_rubber_surface');
  });

  test('frames are spread evenly over the scan', () => {
    expect(spreadIndexes(10, 5)).toEqual([0, 2, 5, 7, 9]);
    expect(spreadIndexes(3, 5)).toEqual([0, 1, 2]);
    expect(spreadIndexes(0, 5)).toEqual([]);
  });
});

describe('TreadPresenceValidator', () => {
  /** A decoder whose frames paint the surface named by the path; `broken.jpg` fails to load. */
  function decoder(paints: Record<string, Paint>, size = { width: 1280, height: 960 }) {
    const created: (DecodableImage & { dispose: jest.Mock })[] = [];
    const make = (paint: Paint, width: number, height: number): DecodableImage & { dispose: jest.Mock } => {
      const img = {
        width,
        height,
        cropAsync: jest.fn(async () => make(paint, width, height)),
        resizeAsync: jest.fn(async (w: number, h: number) => make(paint, w, h)),
        toRawPixelDataAsync: jest.fn(async () => image(paint, width, height)),
        dispose: jest.fn(),
      };
      created.push(img);
      return img;
    };
    const d: ImageDecoder = {
      loadFromFileAsync: async path => {
        const name = path.split('/').pop()!.replace('.jpg', '');
        if (!paints[name]) throw new Error(`cannot decode ${name}`);
        return make(paints[name], size.width, size.height);
      },
    };
    return { decoder: d, created };
  }
  const validator = (d: ImageDecoder) =>
    new TreadPresenceValidator({ pipeline: { resolveFramePath: p => `/docs/${p}`, decoder: d } });

  beforeEach(() => {
    setDebugLogBuffer(false);
    clearDebugLogs();
  });

  test('real tread frames pass; frames are scaled to the analysis width and every image is disposed', async () => {
    const { decoder: d, created } = decoder({ a: grooved, b: grooved, c: groovedAcross, d: floor });
    const v = await validator(d).validate(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    expect(v).toMatchObject({ isTyreTread: true, reason: 'ok' });
    expect(v.confidence).toBeCloseTo(0.75);
    expect(created[0].resizeAsync).toHaveBeenCalledWith(160, 120);
    expect(created.every(img => img.dispose.mock.calls.length === 1)).toBe(true);
  });

  test('a wall swept as a tread is blocked, with the metrics of every frame', async () => {
    const { decoder: d } = decoder({ a: wall, b: wall, c: wall });
    const v = await validator(d).validate(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(v).toMatchObject({ isTyreTread: false, confidence: 0, reason: 'not_rubber_surface' });
    expect(v.metrics.frames.map(f => f.reason)).toEqual(['not_rubber_surface', 'not_rubber_surface', 'not_rubber_surface']);
    expect(blocksTreadResult(v)).toBe(true);
  });

  test('a smooth dark floor is blocked as too smooth', async () => {
    const { decoder: d } = decoder({ a: floor, b: floor, c: floor });
    expect((await validator(d).validate(['a.jpg', 'b.jpg', 'c.jpg'])).reason).toBe('too_smooth_no_grooves');
  });

  test('only 5 of 10 frames are read, spread over the scan; unreadable and demo frames do not block', async () => {
    const paints: Record<string, Paint> = {};
    for (let i = 0; i < 10; i++) paints[`f${i}`] = grooved;
    const { decoder: d, created } = decoder(paints);
    const v = await validator(d).validate(Array.from({ length: 10 }, (_, i) => `f${i}.jpg`));
    expect(v.metrics.frames.map(f => f.index)).toEqual([0, 2, 5, 7, 9]);
    expect(created.filter(img => img.width === 1280)).toHaveLength(5);

    const broken = await validator(decoder({ a: grooved }).decoder).validate(['a.jpg', 'broken.jpg', 'demo://tread/1']);
    expect(broken).toMatchObject({ isTyreTread: false, reason: 'insufficient_frames' });
    expect(broken.metrics.unreadable).toEqual([1]);
    expect(blocksTreadResult(broken)).toBe(false);
  });

  test('logs the verdict and per-frame metrics under [TreadWear] presence:', async () => {
    setDebugLogBuffer(true);
    const { decoder: d } = decoder({ a: wall, b: wall, c: wall });
    await validator(d).validate(['a.jpg', 'b.jpg', 'c.jpg']);
    const text = getDebugLogsText();
    expect(text).toMatch(/\[TreadWear\] .* presence: not_rubber_surface \(tread false, confidence 0\)/);
    expect(text).toMatch(/"medianLum":/);
    expect(text).not.toMatch(/a\.jpg/);
  });
});
