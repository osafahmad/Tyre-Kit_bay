import {
  applySuggestions,
  createSidewallReader,
  type SidewallReadOutcome,
  type SidewallReaderDeps,
} from '../sidewallReader';
import { setSidewallDebug, SIDEWALL_LOG_TAG } from '../ocr/sidewallDebug';
import type { OcrLineLike } from '../ocr/textCandidates';

// The reader passes each whole saved frame to ML Kit and runs the
// semantic/spatial filter on its lines. No TFLite model is involved.

const line = (text: string, y = 0, height = 20, x = 0): OcrLineLike => ({
  text,
  frame: { x, y, width: 100, height },
});

/** A busy sidewall: size and DOT among other moulded text, including a brand and numbers. */
const SIDEWALL: OcrLineLike[] = [
  { text: 'MICHELIN', frame: { x: 0, y: 0, width: 200, height: 60 } },
  { text: 'Primacy 4', frame: { x: 0, y: 80, width: 120, height: 30 } },
  { text: '205/55R16 91V', frame: { x: 0, y: 130, width: 150, height: 20 } },
  { text: 'MAX LOAD 615 KG 2319', frame: { x: 0, y: 160, width: 150, height: 12 } },
  { text: 'DOT 4B7Y ABC', frame: { x: 0, y: 190, width: 120, height: 14 } },
  { text: '2319', frame: { x: 0, y: 210, width: 40, height: 14 } },
];

function setup(
  opts: {
    ocrAvailable?: boolean;
    /** ML Kit lines for a whole frame, by local path. */
    ocr?: (path: string) => OcrLineLike[] | Error;
    maxOcrRuns?: number;
  } = {},
) {
  const deps: SidewallReaderDeps = {
    ocrAvailable: () => opts.ocrAvailable ?? true,
    resolveFramePath: p => `/docs/${p}`,
    recognizeLines: jest.fn(async (path: string) => {
      const r = (opts.ocr ?? (() => SIDEWALL))(path);
      if (r instanceof Error) throw r;
      return r;
    }),
    now: () => new Date(Date.UTC(2026, 10, 6)),
    minAgreeingReads: 2,
    maxOcrRuns: opts.maxOcrRuns ?? 24,
  };
  return { reader: createSidewallReader(deps), deps };
}

const FRAMES = ['f1.jpg', 'f2.jpg', 'f3.jpg'];

/** Exact suggestions (toMatchObject with `{}` would match anything). */
function suggestionsOf(outcome: SidewallReadOutcome) {
  if (outcome.status !== 'done') throw new Error(`read was ${outcome.status}`);
  return outcome.suggestions;
}

/** A different OCR result per frame, by call order. */
const perFrame = (...results: (OcrLineLike[] | Error)[]) => {
  let n = 0;
  return () => results[n++ % results.length];
};

describe('whole frame → ML Kit → filter → suggestions', () => {
  test('size, DOT and a known brand are suggested; model never is', async () => {
    const { reader, deps } = setup();
    const outcome = await reader.read(FRAMES);
    expect(outcome).toEqual({
      status: 'done',
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN' },
      ocrRuns: 2, // agreed after two frames
    });
    // The saved frame itself, at full resolution: no crop and no model input.
    expect(deps.recognizeLines).toHaveBeenNthCalledWith(1, '/docs/f1.jpg');
  });

  test('a value read in only one frame is not suggested', async () => {
    const { reader } = setup({ ocr: perFrame(SIDEWALL, [], []) });
    // Only the date code survives, through the single-date-code rule.
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({ dotTin: '2319' });
  });

  test('disagreeing reads: the majority wins, never a mix', async () => {
    const other = [line('195/65 R15 91H'), line('Goodyear', 40, 40)];
    const { reader } = setup({ ocr: perFrame(other, SIDEWALL, SIDEWALL) });
    expect(suggestionsOf(await reader.read(FRAMES))).toMatchObject({ size: '205/55 R16', make: 'MICHELIN' });
  });

  test('the device read: brand fragments and other words never become a make', async () => {
    // ML Kit's real output on a Continental ComfortContact CC7 (2026-11-06 device log).
    const device = ['Comfortcontact', 'iental', 'OUTSIDE', 'RADIAL', 'TUBELESS'].map((t, i) => line(t, i * 40, 30));
    const { reader } = setup({ ocr: () => device });
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({});
  });

  test('loose text is not taken from a whole frame', async () => {
    const loose: OcrLineLike[] = [
      line('2319', 0, 14), // date code without DOT
      line('DOT 2319', 30, 14), // too short for a TIN
      line('205/55', 60, 14), // no rim anywhere near
      line('MADE IN GERMANY', 75, 14),
      line('900/99R40', 90, 14), // not a real size
      line('85/45', 120, 14), // short width, rim R20: never inferred
      line('R20', 120, 14, 70),
    ];
    const { reader } = setup({ ocr: () => loose });
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({});
  });

  test('an OCR error skips that frame only', async () => {
    const { reader } = setup({ ocr: perFrame(new Error('ML Kit'), SIDEWALL, SIDEWALL) });
    expect(await reader.read(FRAMES)).toMatchObject({
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN' },
      ocrRuns: 3,
    });
  });

  test('no readable text in any frame → done with no suggestions (nothing made up)', async () => {
    const { reader } = setup({ ocr: () => [] });
    expect(await reader.read(FRAMES)).toEqual({ status: 'done', suggestions: {}, ocrRuns: 3 });
  });

  test('stops at the OCR run limit and when cancelled', async () => {
    const capped = setup({ ocr: () => [], maxOcrRuns: 2 });
    expect(await capped.reader.read(FRAMES)).toMatchObject({ ocrRuns: 2 });
    const cancelled = setup();
    expect(await cancelled.reader.read(FRAMES, () => true)).toEqual({ status: 'done', suggestions: {}, ocrRuns: 0 });
    expect(cancelled.deps.recognizeLines).not.toHaveBeenCalled();
  });
});

describe('DOT/TIN across frames', () => {
  test('noisy TINs that disagree still give the agreed date code', async () => {
    const { reader } = setup({
      ocr: perFrame([line('DOT 4B7Y ABC 0124')], [line('DOT 4B7Y A8C 0124')]),
    });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg'])).dotTin).toBe('0124');
  });

  test('one valid date code read and no competing date code → date code only', async () => {
    const { reader } = setup({ ocr: perFrame([line('DOT 1Y6 032MKT 0124')], [line('DOT')]) });
    // The single, unconfirmed TIN body is not suggested.
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg'])).dotTin).toBe('0124');
  });

  test('competing date codes across frames → no DOT suggestion', async () => {
    const { reader } = setup({
      ocr: perFrame([line('DOT 1Y6 032MKT 0124')], [line('DOT 1Y6 032MKT 0724')]),
    });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg']))).not.toHaveProperty('dotTin');
  });
});

describe('fallbacks', () => {
  test('no OCR in this build', async () => {
    const { reader, deps } = setup({ ocrAvailable: false });
    expect(reader.canRead(FRAMES)).toBe(false);
    expect(await reader.read(FRAMES)).toEqual({ status: 'unavailable', reason: 'ocr_missing' });
    expect(deps.recognizeLines).not.toHaveBeenCalled();
  });

  test('only demo frames: nothing is read, and no demo text is suggested', async () => {
    const { reader, deps } = setup();
    expect(reader.canRead(['demo://sidewall/1'])).toBe(false);
    expect(await reader.read(['demo://sidewall/1'])).toEqual({ status: 'unavailable', reason: 'no_frames' });
    expect(deps.recognizeLines).not.toHaveBeenCalled();
  });
});

test('suggestions fill only empty fields the user has not touched', () => {
  const current = { size: '', dotTin: '1234', make: '', model: '' };
  expect(
    applySuggestions(current, { size: '205/55 R16', dotTin: '4B7Y 2319', make: 'MICHELIN', model: 'X' }, new Set(['model'])),
  ).toEqual({ size: '205/55 R16', dotTin: '1234', make: 'MICHELIN', model: '' });
});

describe('[SidewallOCR] logs', () => {
  let log: jest.SpyInstance;
  const lines = () =>
    log.mock.calls.filter(c => String(c[0]).startsWith(SIDEWALL_LOG_TAG)).map(c => `${c[0]} ${c[1] ?? ''}`);

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    setSidewallDebug(false);
    log.mockRestore();
  });

  test('off by default, even in development', async () => {
    await setup().reader.read(FRAMES);
    expect(log).not.toHaveBeenCalled();
  });

  test('when on: parsed values per frame and a summary, never the raw OCR text', async () => {
    setSidewallDebug(true);
    const { reader } = setup({ ocr: () => [line('KX19 ABC'), line('205/55R16 91V', 30)] });
    await reader.read(FRAMES);
    const out = lines();
    expect(out.every(m => m.startsWith(SIDEWALL_LOG_TAG))).toBe(true);
    expect(out.find(m => m.includes('frame 1/3'))).toContain('"size":"205/55 R16"');
    expect(out.find(m => m.includes('frame 1/3'))).toContain('"loadSpeed":"91V"');
    expect(out.some(m => m.includes('read done'))).toBe(true);
    expect(out.some(m => m.includes('KX19'))).toBe(false);
  });
});
