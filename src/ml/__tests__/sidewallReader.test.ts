import {
  applySuggestions,
  createSidewallReader,
  defaultSidewallReaderDeps,
  type SidewallReaderDeps,
} from '../sidewallReader';
import { setSidewallDebug, SIDEWALL_LOG_TAG } from '../ocr/sidewallDebug';
import { fakeLoaderDeps } from '../inference/__fixtures__/models';
import { readFile, readTfliteFile } from '../inference/__fixtures__/tfliteFile';
import { modelManifest } from '../manifest';
import { fakeDecoder } from '../inference/__fixtures__/models';
import type { LoadedModel, PixelRect } from '../inference/types';
import type { YoloDetectorManifestEntry } from '../manifest';
import type { OcrLineLike } from '../ocr/textCandidates';

declare const __dirname: string; // Jest (Node); the project doesn't load Node's types.

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
function labelAt(rect: PixelRect): Label | undefined {
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
  /** OCR of a whole frame (full-frame fallback), by frame path. */
  fullFrame?: (frame: string) => OcrLineLike[] | Error;
} = {}) {
  const detector = opts.detector === undefined ? detectorModel(opts.runs ?? [['Brand', 'Dot-Code', 'Model', 'Size']]) : opts.detector;
  const crops: { path: string; label: Label | undefined; frame: string }[] = [];
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
      const c = crops.find(x => x.path === path);
      if (!c) {
        const r = (opts.fullFrame ?? (() => []))(path);
        if (r instanceof Error) throw r;
        return r;
      }
      if (!c.label) return []; // A combined crop (e.g. Size+Model band) in tests that don't script it.
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

/** Exact suggestions (toMatchObject with `{}` would match anything). */
function suggestionsOf(outcome: Awaited<ReturnType<ReturnType<typeof createSidewallReader>['read']>>) {
  if (outcome.status !== 'done') throw new Error(`read was ${outcome.status}`);
  return outcome.suggestions;
}

describe('crop → OCR → field suggestions', () => {
  test('each label is cropped, read and parsed into its field; crops are deleted', async () => {
    const { reader, deps, crops } = setup();
    const outcome = await reader.read(FRAMES);
    expect(outcome).toEqual({
      status: 'done',
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'Michelin', model: 'Primacy 4' },
      detector: 'used',
      regionsFound: 10, // 5 per frame (4 labels + a weaker Size duplicate), 2 frames
      ocrRuns: 8,
      fullFrameRuns: 0,
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
      make: 'Michelin',
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
    // 4 crops + 1 Size+Model band crop + 1 full-frame size fallback per frame.
    expect(outcome).toMatchObject({ status: 'done', ocrRuns: 18, fullFrameRuns: 3 });
    expect(suggestionsOf(outcome)).toEqual({});
  });

  test('an OCR or crop error skips that region only', async () => {
    const { reader, deps } = setup({ ocr: (l, f) => (l === 'Brand' && f.endsWith('f1.jpg') ? new Error('ML Kit') : GOOD_OCR[l]) });
    (deps.cropToTempFile as jest.Mock).mockRejectedValueOnce(new Error('crop failed'));
    const outcome = await reader.read(FRAMES);
    expect(outcome.status === 'done' && outcome.suggestions).toMatchObject({ make: 'Michelin', size: '205/55 R16' });
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

  test('frames with no regions and no readable text → done with no suggestions', async () => {
    const { reader, deps } = setup({ runs: [[]] });
    expect(await reader.read(FRAMES)).toEqual({
      status: 'done',
      suggestions: {},
      detector: 'used',
      regionsFound: 0,
      ocrRuns: 3,
      fullFrameRuns: 3,
    });
    expect((deps.recognizeLines as jest.Mock).mock.calls.map(c => c[0])).toEqual(
      FRAMES.map(f => `/docs/${f}`),
    );
    expect(deps.cropToTempFile).not.toHaveBeenCalled();
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

  test('detector missing or failing to load: full-frame only; retried next time', async () => {
    const missing = setup({ detector: null });
    const missingOutcome = await missing.reader.read(FRAMES);
    expect(missingOutcome).toMatchObject({ status: 'done', detector: 'missing', fullFrameRuns: 3 });
    expect(suggestionsOf(missingOutcome)).toEqual({});
    const broken = setup({ detector: new Error('bad model') });
    expect(await broken.reader.read(FRAMES)).toMatchObject({ status: 'done', detector: 'missing' });
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

describe('full-frame fallback (no regions): strict size and DOT only', () => {
  /** A busy sidewall: size and DOT among other moulded text, including a brand and numbers. */
  const SIDEWALL: OcrLineLike[] = [
    { text: 'MICHELIN', frame: { x: 0, y: 0, width: 200, height: 60 } },
    { text: 'Primacy 4', frame: { x: 0, y: 80, width: 120, height: 30 } },
    { text: '205/55R16 91V', frame: { x: 0, y: 130, width: 150, height: 20 } },
    { text: 'MAX LOAD 615 KG 2319', frame: { x: 0, y: 160, width: 150, height: 12 } },
    { text: 'DOT 4B7Y ABC', frame: { x: 0, y: 190, width: 120, height: 14 } },
    { text: '2319', frame: { x: 0, y: 210, width: 40, height: 14 } },
  ];

  test('size, the DOT line and a known brand are suggested; model is not', async () => {
    const { reader } = setup({ runs: [[]], fullFrame: () => SIDEWALL });
    const outcome = await reader.read(FRAMES);
    expect(outcome).toMatchObject({
      status: 'done',
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN' },
      fullFrameRuns: 2, // agreed after two frames
    });
    expect(outcome.status === 'done' && outcome.suggestions).not.toHaveProperty('model');
  });

  test('the device read: brand fragments and other words never become a make', async () => {
    // ML Kit's real output on a Continental ComfortContact CC7 (2026-11-06 device log).
    const device: OcrLineLike[] = ['Comfortcontact', 'iental', 'OUTSIDE', 'RADIAL', 'TUBELESS'].map((text, i) => ({
      text,
      frame: { x: 0, y: i * 40, width: 200, height: 30 },
    }));
    const { reader } = setup({ runs: [[]], fullFrame: () => device });
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({});
  });

  test('works without the detector too', async () => {
    const { reader } = setup({ detector: null, fullFrame: () => SIDEWALL });
    expect(await reader.read(FRAMES)).toMatchObject({
      detector: 'missing',
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN' },
    });
  });

  test('loose text is not taken from a whole frame', async () => {
    const loose: OcrLineLike[] = [
      { text: '2319', frame: { x: 0, y: 0, width: 40, height: 14 } }, // date code without DOT
      { text: 'DOT 2319', frame: { x: 0, y: 30, width: 40, height: 14 } }, // too short for a TIN
      { text: '205/55', frame: { x: 0, y: 60, width: 60, height: 14 } }, // no rim anywhere near
      { text: 'MADE IN GERMANY', frame: { x: 0, y: 75, width: 90, height: 14 } },
      { text: '900/99R40', frame: { x: 0, y: 90, width: 90, height: 14 } }, // not a real size
      { text: '85/45', frame: { x: 0, y: 120, width: 60, height: 14 } }, // short width, rim R20: never inferred
      { text: 'R20', frame: { x: 70, y: 120, width: 30, height: 14 } },
    ];
    const { reader } = setup({ runs: [[]], fullFrame: () => loose });
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({});
  });

  test('a frame with regions is read whole only for a missing size (strict size and DOT)', async () => {
    const { reader } = setup({
      runs: [['Brand']],
      ocr: () => [line('MICHELIN')],
      fullFrame: () => SIDEWALL,
    });
    expect(await reader.read(FRAMES)).toMatchObject({
      // Make is never taken from the whole frame here: it came from the Brand crop.
      suggestions: { make: 'Michelin', size: '205/55 R16', dotTin: '4B7Y ABC 2319' },
      fullFrameRuns: 2,
    });
  });

  test('a full-frame OCR error skips that frame', async () => {
    let n = 0;
    const { reader } = setup({ runs: [[]], fullFrame: () => (n++ === 0 ? new Error('ML Kit') : SIDEWALL) });
    expect(await reader.read(FRAMES)).toMatchObject({
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN' },
      fullFrameRuns: 3,
    });
  });
});

describe('agreement and calibration logs', () => {
  test('a single captured frame needs 2 agreeing reads like any other (no test relaxation)', async () => {
    const { reader } = setup();
    // Only the date code survives, through the single-date-code rule.
    expect(suggestionsOf(await reader.read(['only.jpg']))).toEqual({ dotTin: '4B7Y ABC 2319'.slice(-4) });
  });

  test('logs are off by default, even in development', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await setup().reader.read(FRAMES);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  test('when turned on: every line tagged, heuristic decisions and a summary logged', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    setSidewallDebug(true);
    try {
      const brands = [[line('Ontnem')], [line('TLenta')]];
      let n = 0;
      const { reader } = setup({ ocr: l => (l === 'Brand' ? brands[n++ % 2] : GOOD_OCR[l]) });
      await reader.read(['f1.jpg', 'f2.jpg']);
      const out = log.mock.calls.map(c => c.join(' '));
      expect(out.every(m => m.startsWith(SIDEWALL_LOG_TAG))).toBe(true);
      expect(out.some(m => m.includes('brand matched (logo fragment)'))).toBe(true);
      expect(out.some(m => m.includes('read done'))).toBe(true);
      // The old tensor-stat dumps stay removed. Per-region OCR text is logged again
      // (owner request 2026-11-06, see the device diagnostics tests below).
      expect(out.some(m => /crop OCR for|maxScoreByLabel|self-test|tensorByteLength/.test(m))).toBe(false);
    } finally {
      setSidewallDebug(false);
      log.mockRestore();
    }
  });

  test('a detector run() failure is logged and the frame falls back to full-frame reading', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    setSidewallDebug(true);
    try {
      const { reader, detector } = setup({ fullFrame: () => [line('195/55 R15 85V')] });
      (detector as ReturnType<typeof detectorModel>).model.run.mockRejectedValue(new Error('Status: error'));
      const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
      expect(suggestionsOf(outcome)).toEqual({ size: '195/55 R15' });
      expect(log.mock.calls.map(c => c.join(' ')).some(m => m.includes('detector failed on f1.jpg'))).toBe(true);
    } finally {
      setSidewallDebug(false);
      log.mockRestore();
    }
  });
});

describe('device round 2: noisy crops agree after normalisation', () => {
  function noisyReader(model: OcrLineLike[][]) {
    const brand = [[line('Contnental.')], [line('-CONTINENTAL')], [line('Continental')]];
    const n = { Brand: 0, Model: 0 };
    return setup({
      ocr: l =>
        l === 'Brand' ? brand[n.Brand++ % 3] : l === 'Model' ? model[n.Model++ % model.length] : GOOD_OCR[l],
    }).reader;
  }

  test('noisy brand and model reads across frames still give suggestions', async () => {
    const reader = noisyReader([
      [line('ComfortContac CC7')],
      [line('ComfortContact CC7 .')],
      [line('ComfortContact CC7')],
    ]);
    expect(await reader.read(FRAMES)).toMatchObject({
      suggestions: { make: 'Continental', model: 'ComfortContact CC7' },
    });
  });

  test('a 1–1 tie between spellings suggests one real read (best detector score)', async () => {
    const reader = noisyReader([[line('ComfortContac CC7')], [line('ComfortContact CC7')]]);
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    expect(['ComfortContac CC7', 'ComfortContact CC7']).toContain(
      outcome.status === 'done' && outcome.suggestions.model,
    );
  });
});

describe('device round 3', () => {
  test('Size crop on the wrong text: size comes from another crop in the same frame', async () => {
    const { reader, deps } = setup({
      ocr: l =>
        l === 'Size'
          ? [line('ComfortContact')]
          : l === 'Model'
            ? [line('ComfortContact CC7'), line('195/55 R 15 85V', 10)]
            : GOOD_OCR[l],
      fullFrame: () => [line('should not be needed')],
    });
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    expect(outcome).toMatchObject({ suggestions: { size: '195/55 R15' }, fullFrameRuns: 0 });
    expect((deps.recognizeLines as jest.Mock).mock.calls.map(c => c[0])).not.toContain('/docs/f1.jpg');
  });

  test('…and from the saved high-res frame when no crop has it', async () => {
    const { reader, deps } = setup({
      ocr: l => (l === 'Size' ? [line('ComfortContact')] : l === 'Model' ? [line('ComfortContact CC7')] : GOOD_OCR[l]),
      fullFrame: () => [line('Continental'), line('195/55 R 15 85V')],
    });
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    expect(outcome).toMatchObject({ suggestions: { size: '195/55 R15' }, fullFrameRuns: 2 });
    // The saved frame itself, not a crop or the 224x224 tensor.
    expect((deps.recognizeLines as jest.Mock).mock.calls.map(c => c[0])).toContain('/docs/f1.jpg');
  });

  test('noisy TINs that disagree still give the agreed date code', async () => {
    const tins = [[line('D0TYG09RURT'), line('O124', 30)], [line('D07 1Y6 O32MKT'), line('0124', 30)]];
    let n = 0;
    const { reader } = setup({ ocr: l => (l === 'Dot-Code' ? tins[n++ % 2] : GOOD_OCR[l]) });
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    expect(outcome.status === 'done' && outcome.suggestions.dotTin).toBe('0124');
  });

  test('device Brand reads across frames → Continental; corrupt ones alone → empty', async () => {
    const brands = [[line('Ontnem')], [line('TLenta')]];
    let n = 0;
    const one = setup({ ocr: l => (l === 'Brand' ? brands[n++ % 2] : GOOD_OCR[l]) });
    expect(await one.reader.read(['f1.jpg', 'f2.jpg'])).toMatchObject({ suggestions: { make: 'Continental' } });

    const corrupt = setup({ ocr: l => (l === 'Brand' ? [line('val')] : GOOD_OCR[l]) });
    const outcome = await corrupt.reader.read(['f1.jpg', 'f2.jpg']);
    expect(outcome.status === 'done' && outcome.suggestions).not.toHaveProperty('make');
  });
});

describe('device round 4', () => {
  test('one valid date code read and no competing date code → date code suggested', async () => {
    const dots = [[line('D0TYG09RURT'), line('O124', 30)], [line('DOT')]]; // 2nd frame: nothing valid
    let n = 0;
    const { reader } = setup({ ocr: l => (l === 'Dot-Code' ? dots[n++ % 2] : GOOD_OCR[l]) });
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    // Only the date code: the single, unconfirmed TIN body (YG09RURT) is not suggested.
    expect(outcome.status === 'done' && outcome.suggestions.dotTin).toBe('0124');
  });

  test('competing date codes across frames → no DOT suggestion', async () => {
    const dots = [[line('DOT 1Y6 032MKT 0124')], [line('DOT 1Y6 032MKT 0724')]];
    let n = 0;
    const { reader } = setup({ ocr: l => (l === 'Dot-Code' ? dots[n++ % 2] : GOOD_OCR[l]) });
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    expect(outcome.status === 'done' && outcome.suggestions).not.toHaveProperty('dotTin');
  });

  test('size from one crop spanning the Size and Model boxes, before the full frame', async () => {
    const { reader, deps, crops } = setup({
      ocr: l => (l === 'Size' ? [line('ort Conta')] : l === 'Model' ? [line('ComfortContact')] : GOOD_OCR[l]),
      fullFrame: () => [line('H95/6 50152')],
    });
    // The band crop has no single label; answer it with the whole size line.
    (deps.recognizeLines as jest.Mock).mockImplementation(async (path: string) => {
      const c = crops.find(x => x.path === path);
      if (!c) return [line('H95/6 50152')];
      if (c.label === undefined) return [line('ComfortContact CC7'), line('195/55 R 15 85V', 20)];
      return c.label === 'Size' ? [line('ort Conta')] : c.label === 'Model' ? [line('ComfortContact')] : GOOD_OCR[c.label];
    });
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    expect(outcome).toMatchObject({ suggestions: { size: '195/55 R15' }, fullFrameRuns: 0 });
  });

  test('noisy size fragments are never healed into a size', async () => {
    const { reader } = setup({
      ocr: l => (l === 'Size' ? [line('ort Conta')] : l === 'Model' ? [line('95/6S')] : GOOD_OCR[l]),
      fullFrame: () => [line('H95/6 50152'), line('95/6S')],
    });
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    expect(outcome.status === 'done' && outcome.suggestions).not.toHaveProperty('size');
  });
});

describe('device round 5: size', () => {
  test('lengthened Size crop reads model tail + partial width + rim → size suggested', async () => {
    const { reader, deps } = setup({
      ocr: l => (l === 'Size' ? [line('rlConta'), line('A95/55'), line('R15')] : GOOD_OCR[l]),
    });
    const outcome = await reader.read(['f1.jpg', 'f2.jpg']);
    expect(suggestionsOf(outcome).size).toBe('195/55 R15');
    // The Size crop is longer along the text than the other crops (same box size in this test).
    const calls = (deps.cropToTempFile as jest.Mock).mock.calls as [string, PixelRect][];
    const widths = calls.map(([, r]) => r.width);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
  });

  test('partial width with a large rim is not suggested', async () => {
    const { reader } = setup({
      ocr: l => (l === 'Size' ? [line('A85/45'), line('R20')] : GOOD_OCR[l]),
      fullFrame: () => [line('A85/45 R20')],
    });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg']))).not.toHaveProperty('size');
  });
});


describe('[SidewallOCR] device diagnostics', () => {
  let log: jest.SpyInstance;
  /** Every [SidewallOCR] line as "message JSON". */
  const lines = () =>
    log.mock.calls
      .filter(c => String(c[0]).startsWith(SIDEWALL_LOG_TAG))
      .map(c => `${c[0]} ${c[1] ?? ''}`);
  const find = (prefix: string) => lines().find(l => l.startsWith(`${SIDEWALL_LOG_TAG} ${prefix}`));

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    setSidewallDebug(false);
    log.mockRestore();
  });

  test('nothing is logged while off', async () => {
    await setup().reader.read(FRAMES);
    expect(lines()).toEqual([]);
  });

  test('logs each frame’s region boxes and each crop’s OCR text with its parsed value', async () => {
    setSidewallDebug(true);
    await setup().reader.read(FRAMES);
    const frame = find('frame 1/3: ')!;
    expect(frame).toBeDefined();
    const regions = JSON.parse(frame.slice(frame.indexOf('{'))).regions;
    expect(frame).toContain(`${regions.length} regions`);
    expect(new Set(regions.map((r: { label: string }) => r.label))).toEqual(new Set(['Brand', 'Dot-Code', 'Model', 'Size']));
    for (const r of regions) {
      expect(r).toEqual({
        label: expect.any(String),
        score: expect.any(Number),
        box: { x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) },
        cropRect: expect.objectContaining({ width: expect.any(Number) }),
      });
    }
    expect(find('ocr Brand crop')).toContain('"text":["MICHELIN","RADIAL"]');
    expect(find('ocr Brand crop')).toContain('"parsed":"Michelin"');
    expect(find('ocr Size crop')).toContain('205/55R16 91V');
    expect(find('read start')).toContain('"frames":3');
    expect(find('read done')).toBeDefined();
  });

  test('full-frame OCR logs parsed values only, never the raw text', async () => {
    setSidewallDebug(true);
    const { reader } = setup({
      detector: null,
      fullFrame: () => [line('KX19 ABC'), line('205/55R16 91V')],
    });
    await reader.read(FRAMES);
    expect(find('full-frame OCR (no regions)')).toContain('"lines":2');
    expect(find('full-frame OCR (no regions)')).toContain('"size":"205/55 R16"');
    expect(lines().some(l => l.includes('KX19'))).toBe(false);
  });

  test('logs each delegate attempt: Core ML failure, then CPU with the tensors it opened', async () => {
    setSidewallDebug(true);
    const file = readTfliteFile(readFile(`${__dirname}/../../../assets/models/tyre_detector.tflite`));
    const loader = fakeLoaderDeps({
      resolveAssetUri: () => 'file:///bundle/tyre_detector.tflite',
      acceleration: ['core-ml'],
      createModel: jest.fn(async (_url: string, delegates: string[]) => {
        if (delegates.length) throw new Error('Core ML delegate could not be created');
        return { inputs: file.inputs, outputs: file.outputs, run: jest.fn() };
      }),
    });
    const loaded = await defaultSidewallReaderDeps(modelManifest, () => loader).loadDetector();
    expect(loaded?.delegate).toBe('cpu');
    expect(find('detector loading')).toContain('"acceleration":["core-ml"]');
    expect(find('detector failed to open with core-ml')).toContain('Core ML delegate could not be created');
    expect(find('detector opened with cpu')).toContain('[1,3,224,224]');
  });
});
