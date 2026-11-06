import { applySuggestions, createSidewallReader, type SidewallReaderDeps } from '../sidewallReader';
import { modelManifest } from '../manifest';
import { fakeDecoder } from '../inference/__fixtures__/models';
import type { LoadedModel, PixelRect } from '../inference/types';
import type { YoloDetectorManifestEntry } from '../manifest';
import type { OcrLineLike } from '../ocr/textCandidates';

const entry = modelManifest.sidewallTextDetector!;
const N = entry.outputShape[2];
const LABEL = { Brand: 0, 'Dot-Code': 1, Model: 2, Size: 3 } as const;
type Label = keyof typeof LABEL;

/** Boxes per label at fixed places (normalised cx, cy, w, h), so OCR can be mocked by crop position. */
const BOXES: Record<Label, [number, number, number, number]> = {
  Brand: [0.25, 0.25, 0.25, 0.125],
  'Dot-Code': [0.75, 0.25, 0.25, 0.125],
  Model: [0.25, 0.75, 0.25, 0.125],
  Size: [0.75, 0.75, 0.25, 0.125],
};

/** Detector whose output, per run, contains the given labels (and a weaker duplicate Size box). */
function detectorModel(perRun: Label[][]): LoadedModel<YoloDetectorManifestEntry> & { model: { run: jest.Mock } } {
  let call = 0;
  return {
    key: 'sidewallTextDetector',
    entry,
    delegate: 'cpu',
    model: {
      inputs: [{ name: 'in', dataType: 'float32', shape: entry.inputShape }],
      outputs: [{ name: 'out', dataType: 'float32', shape: entry.outputShape }],
      run: jest.fn(async () => {
        const labels = perRun[Math.min(call++, perRun.length - 1)];
        const out = new Float32Array(8 * N);
        labels.forEach((label, j) => {
          BOXES[label].forEach((v, r) => (out[r * N + j] = v));
          out[(4 + LABEL[label]) * N + j] = 0.9 - j * 0.01;
        });
        // A lower-scoring Size box elsewhere: only the best box per label is read.
        if (labels.includes('Size')) {
          [0.5, 0.5, 0.1, 0.1].forEach((v, r) => (out[r * N + 100] = v));
          out[(4 + LABEL.Size) * N + 100] = 0.3;
        }
        return [out.buffer];
      }),
    },
  };
}

/** Which label's box a crop rect came from (fake frames are 224×224, so no letterbox). */
function labelAt(rect: PixelRect): Label {
  const cx = (rect.x + rect.width / 2) / 224;
  const cy = (rect.y + rect.height / 2) / 224;
  return (Object.keys(BOXES) as Label[]).find(
    l => Math.abs(BOXES[l][0] - cx) < 0.05 && Math.abs(BOXES[l][1] - cy) < 0.05,
  )!;
}

const line = (text: string, height = 20): OcrLineLike => ({ text, frame: { x: 0, y: 0, width: 100, height } });

const GOOD_OCR: Record<Label, OcrLineLike[]> = {
  Brand: [line('MICHELIN', 40), line('RADIAL', 10)],
  'Dot-Code': [line('DOT 4B7Y ABC 2319')],
  Model: [line('Primacy 4')],
  Size: [line('205/55R16 91V')],
};

function setup(opts: {
  runs?: Label[][];
  ocr?: (label: Label, frame: string) => OcrLineLike[] | Error;
  ocrAvailable?: boolean;
  detector?: LoadedModel<YoloDetectorManifestEntry> | null | Error;
} = {}) {
  const detector = opts.detector === undefined ? detectorModel(opts.runs ?? [['Brand', 'Dot-Code', 'Model', 'Size']]) : opts.detector;
  const crops: { path: string; label: Label; frame: string }[] = [];
  const deps: SidewallReaderDeps & { [k: string]: unknown } = {
    ocrAvailable: () => opts.ocrAvailable ?? true,
    loadDetector: jest.fn(async () => {
      if (detector instanceof Error) throw detector;
      return detector;
    }),
    pipeline: { resolveFramePath: p => `/docs/${p}`, decoder: fakeDecoder({ width: 224, height: 224 }).decoder },
    cropToTempFile: jest.fn(async (framePath: string, rect: PixelRect) => {
      const path = `/tmp/crop${crops.length}.jpg`;
      crops.push({ path, label: labelAt(rect), frame: framePath });
      return path;
    }),
    recognizeLines: jest.fn(async (path: string) => {
      const c = crops.find(x => x.path === path)!;
      const r = (opts.ocr ?? (l => GOOD_OCR[l]))(c.label, c.frame);
      if (r instanceof Error) throw r;
      return r;
    }),
    deleteFile: jest.fn(async () => {}),
    now: () => new Date(Date.UTC(2026, 10, 6)),
    minAgreeingReads: 2,
    maxOcrRuns: 24,
  };
  return { reader: createSidewallReader(deps), deps, crops, detector };
}

const FRAMES = ['f1.jpg', 'f2.jpg', 'f3.jpg'];

describe('crop → OCR → field suggestions', () => {
  test('each label is cropped, read and parsed into its field; crops are deleted', async () => {
    const { reader, deps, crops } = setup();
    const outcome = await reader.read(FRAMES);
    expect(outcome).toEqual({
      status: 'done',
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN', model: 'Primacy 4' },
      regionsFound: 10, // 5 per frame (4 labels + a weaker Size duplicate), 2 frames
      ocrRuns: 8,
    });
    // Two agreeing frames per field are enough: the third frame isn't read.
    expect(crops.map(c => c.frame)).toEqual([...Array(4).fill('/docs/f1.jpg'), ...Array(4).fill('/docs/f2.jpg')]);
    expect(deps.deleteFile).toHaveBeenCalledTimes(8);
    // Crop rects are whole pixels with the OCR margin around the box.
    const [rect] = (deps.cropToTempFile as jest.Mock).mock.calls[0].slice(1) as [PixelRect];
    expect(Object.values(rect).every(Number.isInteger)).toBe(true);
  });

  test('a value read in only one frame is not suggested', async () => {
    const { reader } = setup({
      ocr: (l, frame) => (l === 'Model' && !frame.endsWith('f1.jpg') ? [] : GOOD_OCR[l]),
    });
    const outcome = await reader.read(FRAMES);
    expect(outcome.status === 'done' && outcome.suggestions).toEqual({
      size: '205/55 R16',
      dotTin: '4B7Y ABC 2319',
      make: 'MICHELIN',
    });
  });

  test('disagreeing reads: the majority wins, never a mix', async () => {
    const sizes = ['205/55R16', '205/65R16', '205/55R16'];
    let i = 0;
    const { reader } = setup({ ocr: l => (l === 'Size' ? [line(sizes[i++])] : []) });
    const outcome = await reader.read(FRAMES);
    expect(outcome.status === 'done' && outcome.suggestions).toEqual({ size: '205/55 R16' });
  });

  test('crops with no recognisable text give no suggestions', async () => {
    const { reader } = setup({
      ocr: l => (l === 'Size' ? [line('TUBELESS')] : l === 'Dot-Code' ? [line('DOT 4B7Y ABC 5719')] : []),
    });
    const outcome = await reader.read(FRAMES);
    expect(outcome).toMatchObject({ status: 'done', suggestions: {}, ocrRuns: 12 });
  });

  test('an OCR or crop error skips that region only', async () => {
    const { reader, deps } = setup({ ocr: (l, f) => (l === 'Brand' && f.endsWith('f1.jpg') ? new Error('ML Kit') : GOOD_OCR[l]) });
    (deps.cropToTempFile as jest.Mock).mockRejectedValueOnce(new Error('crop failed'));
    const outcome = await reader.read(FRAMES);
    expect(outcome.status === 'done' && outcome.suggestions).toMatchObject({ make: 'MICHELIN', size: '205/55 R16' });
  });

  test('a frame the detector fails on is skipped', async () => {
    const { reader, detector } = setup();
    const run = (detector as ReturnType<typeof detectorModel>).model.run;
    const working = run.getMockImplementation()!;
    run.mockRejectedValueOnce(new Error('delegate'));
    run.mockImplementation(working);
    const outcome = await reader.read(FRAMES);
    expect(outcome.status === 'done' && Object.keys(outcome.suggestions)).toHaveLength(4);
  });

  test('frames with no regions → done with no suggestions', async () => {
    const { reader, deps } = setup({ runs: [[]] });
    expect(await reader.read(FRAMES)).toEqual({ status: 'done', suggestions: {}, regionsFound: 0, ocrRuns: 0 });
    expect(deps.recognizeLines).not.toHaveBeenCalled();
  });

  test('stops at the OCR run limit and when cancelled', async () => {
    const limited = setup({ ocr: () => [] });
    limited.deps.maxOcrRuns = 5;
    expect(await limited.reader.read(FRAMES)).toMatchObject({ ocrRuns: 5 });

    const { reader, deps } = setup();
    expect(await reader.read(FRAMES, () => true)).toMatchObject({ status: 'done', ocrRuns: 0 });
    expect(deps.recognizeLines).not.toHaveBeenCalled();
  });
});

describe('fallbacks', () => {
  test('no OCR in this build', async () => {
    const { reader, deps } = setup({ ocrAvailable: false });
    expect(reader.canRead(FRAMES)).toBe(false);
    expect(await reader.read(FRAMES)).toEqual({ status: 'unavailable', reason: 'ocr_missing' });
    expect(deps.loadDetector).not.toHaveBeenCalled();
  });

  test('only demo frames', async () => {
    const { reader } = setup();
    expect(reader.canRead(['demo://sidewall/1'])).toBe(false);
    expect(await reader.read(['demo://sidewall/1'])).toEqual({ status: 'unavailable', reason: 'no_frames' });
  });

  test('detector missing or failing to load; retried next time', async () => {
    const missing = setup({ detector: null });
    expect(await missing.reader.read(FRAMES)).toEqual({ status: 'unavailable', reason: 'detector_missing' });
    const broken = setup({ detector: new Error('bad model') });
    expect(await broken.reader.read(FRAMES)).toEqual({ status: 'unavailable', reason: 'detector_missing' });
    await broken.reader.read(FRAMES);
    expect(broken.deps.loadDetector).toHaveBeenCalledTimes(2);
  });

  test('a loaded detector is reused', async () => {
    const { reader, deps } = setup();
    await reader.read(FRAMES);
    await reader.read(FRAMES);
    expect(deps.loadDetector).toHaveBeenCalledTimes(1);
  });
});

test('suggestions fill only empty fields the user has not touched', () => {
  const current = { size: '', dotTin: '1234', make: '', model: '' };
  expect(
    applySuggestions(current, { size: '205/55 R16', dotTin: '4B7Y 2319', make: 'MICHELIN', model: 'X' }, new Set(['model'])),
  ).toEqual({ size: '205/55 R16', dotTin: '1234', make: 'MICHELIN', model: '' });
});
