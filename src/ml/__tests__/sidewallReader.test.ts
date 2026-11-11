import {
  applySuggestions,
  bestSizeRead,
  centreCropRect,
  createSidewallReader,
  type SidewallReadOutcome,
  type SidewallReaderDeps,
} from '../sidewallReader';
import { setSidewallDebug, SIDEWALL_LOG_TAG } from '../ocr/sidewallDebug';
import type { OcrLineLike } from '../ocr/textCandidates';

// The reader passes the centre of each saved frame (then, if that gave
// nothing, the whole frame) to ML Kit and runs the semantic/spatial filter on
// its lines. No TFLite model is involved.

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

type Part = 'centre' | 'whole';

function setup(
  opts: {
    ocrAvailable?: boolean;
    /** ML Kit lines for one saved frame (`f1.jpg`…), centre crop or whole frame. */
    ocr?: (frame: string, part: Part) => OcrLineLike[] | Error;
    cropFails?: boolean;
    maxOcrRuns?: number;
  } = {},
) {
  const calls: { frame: string; part: Part }[] = [];
  const deps: SidewallReaderDeps = {
    ocrAvailable: () => opts.ocrAvailable ?? true,
    resolveFramePath: p => `/docs/${p}`,
    cropCentreToTempFile: jest.fn(async (path: string) => {
      if (opts.cropFails) throw new Error('nitro');
      return { path: `${path}#centre`, sourceWidth: 640, sourceHeight: 360 };
    }),
    deleteFile: jest.fn(async () => {}),
    recognizeLines: jest.fn(async (path: string) => {
      const part: Part = path.endsWith('#centre') ? 'centre' : 'whole';
      const frame = path.replace('/docs/', '').replace('#centre', '');
      calls.push({ frame, part });
      const r = (opts.ocr ?? ((_f, p) => (p === 'centre' ? SIDEWALL : [])))(frame, part);
      if (r instanceof Error) throw r;
      return r;
    }),
    now: () => new Date(Date.UTC(2026, 10, 6)),
    centreCropRatio: 0.6,
    minAgreeingReads: 2,
    maxOcrRuns: opts.maxOcrRuns ?? 24,
  };
  return { reader: createSidewallReader(deps), deps, calls };
}

const FRAMES = ['f1.jpg', 'f2.jpg', 'f3.jpg'];

/** Exact suggestions (toMatchObject with `{}` would match anything). */
function suggestionsOf(outcome: SidewallReadOutcome) {
  if (outcome.status !== 'done') throw new Error(`read was ${outcome.status}`);
  return outcome.suggestions;
}

/** Centre-crop OCR per frame, in frame order (`f1.jpg` → first); the whole frame reads nothing. */
const perFrame =
  (...results: (OcrLineLike[] | Error)[]) =>
  (frame: string, part: Part) =>
    part === 'centre' ? results[(Number(frame.match(/\d+/)![0]) - 1) % results.length] : [];

describe('centre crop → ML Kit → filter → suggestions', () => {
  test('size, DOT, a known brand and a listed model family are suggested (model: owner 2026-11-11)', async () => {
    const { reader, deps } = setup();
    const outcome = await reader.read(FRAMES);
    expect(outcome).toEqual({
      status: 'done',
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN', model: 'Primacy' },
      ocrRuns: 2, // agreed after two frames
    });
    // The centre of the saved frame, then the crop is deleted; no whole-frame read was needed.
    expect(deps.cropCentreToTempFile).toHaveBeenCalledWith('/docs/f1.jpg', 0.6);
    expect(deps.recognizeLines).toHaveBeenNthCalledWith(1, '/docs/f1.jpg#centre');
    expect(deps.deleteFile).toHaveBeenCalledWith('/docs/f1.jpg#centre');
  });

  test('read in only one frame: size, make and the whole DOT/TIN are suggested (owner 2026-11-10)', async () => {
    const { reader } = setup({ ocr: perFrame(SIDEWALL, [], []) });
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({
      size: '205/55 R16',
      make: 'MICHELIN',
      model: 'Primacy',
      dotTin: '4B7Y ABC 2319',
    });
  });

  test('frame 2 blurred: the size from frame 1 is kept', async () => {
    const { reader } = setup({ ocr: perFrame([line('205/55R16 91V')], [line('2O5/5')]) });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg']))).toEqual({ size: '205/55 R16' });
  });

  test('divergent single sizes: the read with a load/speed index wins', async () => {
    const { reader } = setup({ ocr: perFrame([line('205/65 R16')], [line('205/55R16 91V')]) });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg']))).toEqual({ size: '205/55 R16' });
  });

  test('disagreeing reads: the majority wins, never a mix', async () => {
    const other = [line('195/65 R15 91H'), line('Goodyear', 40, 40)];
    const { reader } = setup({ ocr: perFrame(other, SIDEWALL, SIDEWALL) });
    expect(suggestionsOf(await reader.read(FRAMES))).toMatchObject({ size: '205/55 R16', make: 'MICHELIN' });
  });

  test('the device read: short fragments never become a make; the Contact model word does (owner 2026-11-10)', async () => {
    // ML Kit's real output on a Continental ComfortContact CC7 (2026-11-06 device log).
    const device = ['iental', 'OUTSIDE', 'RADIAL', 'TUBELESS'].map((t, i) => line(t, i * 40, 30));
    expect(suggestionsOf(await setup({ ocr: () => device }).reader.read(FRAMES))).toEqual({});
    const withModel = [line('Comfortcontact', 200, 30), ...device];
    expect(suggestionsOf(await setup({ ocr: () => withModel }).reader.read(FRAMES))).toEqual({ make: 'Continental', model: 'ComfortContact' });
  });

  test('iPhone 13 round 2: 95/55 + 5B15 in frame 1, I95/35 R15 in frame 2', async () => {
    const f1 = [line('95/55', 0, 30), line('5B15 85VE C', 34, 30), line('ntinenals', 100, 40)];
    const f2 = [line('LLSS I95/35 R15', 0, 30), line('orContact', 60, 30)];
    const { reader } = setup({ ocr: perFrame(f1, f2, []) });
    // Sizes tie 1–1 with equal scores and length: the earliest frame wins (no aspect-ratio prior).
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({ size: '195/55 R15', make: 'Continental' });
  });

  test('round 8: run 2, width/aspect and rim read in different frames are joined (owner 2026-11-10)', async () => {
    const f1 = [line('Continental', 0, 40), line('195 55', 60, 30)];
    const f2 = [line('R15 85Vt', 60, 30)];
    const { reader } = setup({ ocr: perFrame(f1, f2, []) });
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({ size: '195/55 R15', make: 'Continental' });
  });

  test('round 8: parts are not joined on a tie, with only a stray rim, or when a frame read a whole size', async () => {
    const tie = setup({ ocr: perFrame([line('195/55')], [line('205/55')], [line('R15 85V')]) });
    expect(suggestionsOf(await tie.reader.read(FRAMES))).toEqual({});
    const stray = setup({ ocr: perFrame([line('195/55')], [line('R15')], []) });
    expect(suggestionsOf(await stray.reader.read(FRAMES))).toEqual({});
    const whole = setup({ ocr: perFrame([line('205/55R16 91V')], [line('195/55')], [line('R15 85V')]) });
    expect(suggestionsOf(await whole.reader.read(FRAMES))).toEqual({ size: '205/55 R16' });
  });

  test('round 11: noisy rims and a two-digit width join across frames (owner request 2026-11-11)', async () => {
    const dollar = setup({ ocr: perFrame([line('195/55')], [line('$815 85V')], []) });
    expect(suggestionsOf(await dollar.reader.read(FRAMES))).toEqual({ size: '195/55 R15' });
    const unmarked = setup({ ocr: perFrame([line('195/55')], [line('1545V)')], []) });
    expect(suggestionsOf(await unmarked.reader.read(FRAMES))).toEqual({ size: '195/55 R15' });
    const short = setup({ ocr: perFrame([line('A95/55')], [line('1545V)')], [line('$81525NE')]) });
    expect(suggestionsOf(await short.reader.read(FRAMES))).toEqual({ size: '195/55 R15' });
  });

  test('round 11: the two-digit width is gated and never beats a 3-digit width read', async () => {
    const bigRim = setup({ ocr: perFrame([line('A95/55')], [line('R18 95V')], []) });
    expect(suggestionsOf(await bigRim.reader.read(FRAMES))).toEqual({});
    const tie = setup({ ocr: perFrame([line('A95/55')], [line('05/55')], [line('R15 85V')]) });
    expect(suggestionsOf(await tie.reader.read(FRAMES))).toEqual({});
    const full = setup({ ocr: perFrame([line('A95/55')], [line('205/55')], [line('R15 85V')]) });
    expect(suggestionsOf(await full.reader.read(FRAMES))).toEqual({ size: '205/55 R15' });
    const noRim = setup({ ocr: perFrame([line('A95/55')], [line('A95/55')], []) });
    expect(suggestionsOf(await noRim.reader.read(FRAMES))).toEqual({});
    const lbs = setup({ ocr: perFrame([line('A95/55')], [line('1323 LBS')], []) });
    expect(suggestionsOf(await lbs.reader.read(FRAMES))).toEqual({});
  });

  describe('round 12: one 8-frame burst, size in the first frames and DOT in the last (Redmi 13, owner 2026-11-11)', () => {
    const BURST = ['f1.jpg', 'f2.jpg', 'f3.jpg', 'f4.jpg', 'f5.jpg', 'f6.jpg', 'f7.jpg', 'f8.jpg'];
    const sizeBlock = [line('Continental', 0, 40), line('195/55 R15 85V', 50)];
    const dotStamp = [line('DOT 16092UT 0124')];
    /** Frames 1–4 show the size block, frames 5–8 the DOT stamp; the whole frame reads nothing. */
    const burst = (frame: string, part: Part) =>
      part !== 'centre' ? [] : Number(frame.match(/\d+/)![0]) <= 4 ? sizeBlock : dotStamp;

    test('each field keeps its own best read: all three are suggested together', async () => {
      const { reader } = setup({ ocr: burst });
      const outcome = await reader.read(BURST);
      expect(suggestionsOf(outcome)).toEqual({ make: 'Continental', size: '195/55 R15', dotTin: '16092UT 0124' });
      expect(outcome).toMatchObject({ status: 'done' });
    });

    test('the same with the frames the other way round, and with the DOT read in one frame only', async () => {
      const reversed = (frame: string, part: Part) =>
        part !== 'centre' ? [] : Number(frame.match(/\d+/)![0]) <= 4 ? dotStamp : sizeBlock;
      expect(suggestionsOf(await setup({ ocr: reversed }).reader.read(BURST))).toEqual({
        make: 'Continental',
        size: '195/55 R15',
        dotTin: '16092UT 0124',
      });
      const once = (frame: string, part: Part) =>
        part !== 'centre' ? [] : frame === 'f7.jpg' ? dotStamp : frame === 'f8.jpg' ? [] : sizeBlock;
      expect(suggestionsOf(await setup({ ocr: once }).reader.read(BURST))).toEqual({
        make: 'Continental',
        size: '195/55 R15',
        dotTin: '16092UT 0124',
      });
    });

    test('a field read by no frame is simply left out; the others are kept', async () => {
      const noDot = (frame: string, part: Part) => (part === 'centre' ? sizeBlock : []);
      expect(suggestionsOf(await setup({ ocr: noDot }).reader.read(BURST))).toEqual({ make: 'Continental', size: '195/55 R15' });
    });

    test('the OCR run cap never stops the burst before the DOT frames (2 runs per frame at most)', async () => {
      const { reader, calls } = setup({ ocr: burst });
      const outcome = await reader.read(BURST);
      expect(suggestionsOf(outcome).dotTin).toBe('16092UT 0124');
      expect(calls.length).toBeLessThanOrEqual(BURST.length * 2);
      expect(outcome).toMatchObject({ ocrRuns: calls.length });
    });

    test('punctuation noise around the DOT marker is dropped; letters are kept as read', async () => {
      for (const text of ['DOT:16092UT 0124', 'DOT: 16092UT 0124', '.D0T 16092UT 0124', '~DOT 16092UT 0124']) {
        const { reader } = setup({ ocr: perFrame([line(text)], [], []) });
        expect(suggestionsOf(await reader.read(FRAMES)).dotTin).toBe('16092UT 0124');
      }
      const wrapped = setup({ ocr: perFrame([line('DOT: 16092UT'), line('0124', 30)], [], []) });
      expect(suggestionsOf(await wrapped.reader.read(FRAMES)).dotTin).toBe('16092UT 0124');
      // `tYe0e` is letters and digits, not punctuation: dropping it would guess where the TIN starts,
      // and with it the read is 16 characters, over the 13 of a TIN. It stays empty (CLAUDE.md).
      const noisy = setup({ ocr: perFrame([line('DOT:tYe0e 16092UT 0124')], [line('DOT:tYe0e'), line('16092UT 0124', 30)], []) });
      expect(suggestionsOf(await noisy.reader.read(FRAMES))).not.toHaveProperty('dotTin');
    });
  });

  describe('model from a listed family (owner decision 2026-11-11, Redmi 13 logs)', () => {
    test('ComfortContact in some frames and CC7 in others combine to ComfortContact CC7', async () => {
      const family = [line('Continental', 0, 40), line('ComfortContact', 50, 30)];
      const spaced = [line('Comfort Contact', 50, 30)];
      const code = [line('CC7', 0, 30), line('195/55 R15 85V', 40)];
      const { reader } = setup({ ocr: perFrame(family, spaced, code) });
      expect(suggestionsOf(await reader.read(FRAMES))).toEqual({
        make: 'Continental',
        size: '195/55 R15',
        model: 'ComfortContact CC7',
      });
    });

    test('Redmi 13 reads: noisy family names in every frame, CC7 read whole (owner 2026-11-11)', async () => {
      const f1 = [line('Comfortontact', 0, 30), line('CC7', 40, 30), line('195/55 R15 85V', 80)];
      const f2 = [line('ComiortContae', 0, 30), line('CC7', 40, 30)];
      const f3 = [line('Comforto Contact', 0, 30), line('DOT 16092UT 0124', 60, 14)];
      const { reader } = setup({ ocr: perFrame(f1, f2, f3) });
      expect(suggestionsOf(await reader.read(FRAMES))).toEqual({
        make: 'Continental',
        size: '195/55 R15',
        dotTin: '16092UT 0124',
        model: 'ComfortContact CC7',
      });
    });

    test('Redmi 13 frame 6: the code glued to a family fragment (OntactCC7) attaches across frames', async () => {
      const f1 = [line('Comfortontact', 0, 30), line('195/55 R15 85V', 40)];
      const f2 = [line('Comforto Contact', 0, 30)];
      const f6 = [line('OntactCC7', 0, 30)];
      const { reader } = setup({ ocr: perFrame(f1, f2, f6) });
      expect(suggestionsOf(await reader.read(FRAMES))).toEqual({ make: 'Continental', size: '195/55 R15', model: 'ComfortContact CC7' });
      const onlyGlued = setup({ ocr: perFrame(f6, f6, f6) });
      expect(suggestionsOf(await onlyGlued.reader.read(FRAMES))).toEqual({}); // a code never stands alone
    });

    test('family and code in one frame; family alone in one frame; code alone never', async () => {
      const both = setup({ ocr: perFrame([line('ComfortContact CC7')], [], []) });
      expect(suggestionsOf(await both.reader.read(FRAMES))).toEqual({ make: 'Continental', model: 'ComfortContact CC7' });
      const alone = setup({ ocr: perFrame([line('ComfortContact')], [], []) });
      expect(suggestionsOf(await alone.reader.read(FRAMES))).toEqual({ make: 'Continental', model: 'ComfortContact' });
      const codeOnly = setup({ ocr: perFrame([line('CC7')], [line('CC7')], [line('CC7')]) });
      expect(suggestionsOf(await codeOnly.reader.read(FRAMES))).toEqual({});
    });

    test('a code of another family, or two codes tying, attach nothing', async () => {
      const other = setup({ ocr: perFrame([line('ComfortContact')], [line('UC6')], []) });
      expect(suggestionsOf(await other.reader.read(FRAMES))).toEqual({ make: 'Continental', model: 'ComfortContact' });
      const tie = setup({ ocr: perFrame([line('ComfortContact')], [line('CC6')], [line('CC7')]) });
      expect(suggestionsOf(await tie.reader.read(FRAMES))).toEqual({ make: 'Continental', model: 'ComfortContact' });
    });

    test('free text and fragments are never a model', async () => {
      const text = [line('orContact', 0, 30), line('TUBELESS RADIAL', 40), line('Primacy4', 80)];
      expect(suggestionsOf(await setup({ ocr: () => text }).reader.read(FRAMES))).toEqual({ make: 'Continental' });
    });

    test('disagreeing families: the majority wins, never a mix', async () => {
      const { reader } = setup({ ocr: perFrame([line('ComfortContact')], [line('UltraContact')], [line('ComfortContact')]) });
      expect(suggestionsOf(await reader.read(FRAMES)).model).toBe('ComfortContact');
    });
  });

  test('dominantValue: a tie gives nothing', () => {
    const { dominantValue } = require('../sidewallReader') as typeof import('../sidewallReader');
    expect(dominantValue(['a', 'b', 'a'])).toBe('a');
    expect(dominantValue(['a', 'b'])).toBeNull();
    expect(dominantValue([])).toBeNull();
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

  test('an OCR error skips that read only', async () => {
    const { reader } = setup({ ocr: perFrame(new Error('ML Kit'), SIDEWALL, SIDEWALL) });
    expect(await reader.read(FRAMES)).toMatchObject({
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN' },
      ocrRuns: 4, // f1 centre (error) + f1 whole frame, f2 and f3 centres
    });
  });

  test('the whole frame is read when the centre crop cuts the text off', async () => {
    const { reader, calls } = setup({ ocr: (_f, part) => (part === 'whole' ? SIDEWALL : [line('ADIAL')]) });
    expect(await reader.read(FRAMES)).toMatchObject({
      suggestions: { size: '205/55 R16', dotTin: '4B7Y ABC 2319', make: 'MICHELIN' },
      ocrRuns: 4,
    });
    expect(calls.slice(0, 2)).toEqual([
      { frame: 'f1.jpg', part: 'centre' },
      { frame: 'f1.jpg', part: 'whole' },
    ]);
  });

  test('a failed centre crop falls back to the whole frame', async () => {
    const { reader } = setup({ cropFails: true, ocr: () => SIDEWALL });
    expect(suggestionsOf(await reader.read(FRAMES))).toEqual({
      size: '205/55 R16',
      dotTin: '4B7Y ABC 2319',
      make: 'MICHELIN',
      model: 'Primacy',
    });
  });

  test('no readable text in any frame → done with no suggestions (nothing made up)', async () => {
    const { reader } = setup({ ocr: () => [] });
    expect(await reader.read(FRAMES)).toEqual({ status: 'done', suggestions: {}, ocrRuns: 6 });
  });

  test('stops at the OCR run limit and when cancelled', async () => {
    const capped = setup({ ocr: () => [], maxOcrRuns: 3 });
    expect(await capped.reader.read(FRAMES)).toMatchObject({ ocrRuns: 3 });
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

  test('one valid DOT/TIN read and no competing read → the whole TIN (round 9, owner 2026-11-10)', async () => {
    const { reader } = setup({ ocr: perFrame([line('DOT 1Y6 032MKT 0124')], [line('DOT')]) });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg'])).dotTin).toBe('1Y6 032MKT 0124');
  });

  test('two different TINs with the same date code → still the date code only', async () => {
    const { reader } = setup({ ocr: perFrame([line('DOT 1Y6 032MKT 0124')], [line('DOT EX2H 4KR 0124')]) });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg'])).dotTin).toBe('0124');
  });

  test('round 9: iPhone 13 marker misreads, single frame', async () => {
    const one = setup({ ocr: perFrame([line('OT1DT IOES 2421')], []) });
    expect(suggestionsOf(await one.reader.read(['f1.jpg', 'f2.jpg'])).dotTin).toBe('IOES 2421');
    const two = setup({ ocr: perFrame([line('oTELDT 4B8R 1222')], []) });
    expect(suggestionsOf(await two.reader.read(['f1.jpg', 'f2.jpg'])).dotTin).toBe('4B8R 1222');
  });

  test('round 9: a TIN with no DOT marker needs 2 agreeing frames', async () => {
    const tin = [line('EX2H 4KR 3721')];
    const single = setup({ ocr: perFrame(tin, []) });
    expect(suggestionsOf(await single.reader.read(['f1.jpg', 'f2.jpg']))).not.toHaveProperty('dotTin');
    const agreed = setup({ ocr: perFrame(tin, tin) });
    expect(suggestionsOf(await agreed.reader.read(['f1.jpg', 'f2.jpg'])).dotTin).toBe('EX2H 4KR 3721');
  });

  test('round 10: a marker-less TIN wrapped over two lines needs 2 agreeing frames', async () => {
    const wrapped = [line('EX2H 4KR'), line('3721', 30)];
    const single = setup({ ocr: perFrame(wrapped, []) });
    expect(suggestionsOf(await single.reader.read(['f1.jpg', 'f2.jpg']))).not.toHaveProperty('dotTin');
    const agreed = setup({ ocr: perFrame(wrapped, [line('EX2H 4KR 3721')]) });
    expect(suggestionsOf(await agreed.reader.read(['f1.jpg', 'f2.jpg'])).dotTin).toBe('EX2H 4KR 3721');
  });

  test('round 10: a bare 4-digit number under a word is never a DOT/TIN, even in every frame', async () => {
    const bare = [line('OUTSIDE'), line('1323', 30)];
    const { reader } = setup({ ocr: perFrame(bare, bare) });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg']))).not.toHaveProperty('dotTin');
  });

  test('round 9: load and pressure numbers never become a marker-less TIN, even in every frame', async () => {
    const load = [line('MAX LOAD 600 KG (1323 LBS)'), line('MAX LOAD 600 KG 1323')];
    const { reader } = setup({ ocr: perFrame(load, load) });
    expect(suggestionsOf(await reader.read(['f1.jpg', 'f2.jpg']))).not.toHaveProperty('dotTin');
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

  test('when on: raw ML Kit text, parsed values, rejection reasons and a summary (TEMPORARY)', async () => {
    setSidewallDebug(true);
    const { reader } = setup({ ocr: (_f, part) => (part === 'centre' ? [line('RADIAL'), line('205/55R16 91V', 30)] : []) });
    await reader.read(FRAMES);
    const out = lines();
    expect(out.every(m => m.startsWith(SIDEWALL_LOG_TAG))).toBe(true);
    const raw = out.find(m => m.includes('ML Kit raw text (frame 1/3, centre 0.6)'))!;
    expect(raw).toContain('"text":"RADIAL"');
    expect(raw).toContain('"frameSize":[640,360]');
    const parsed = out.find(m => m.includes('frame 1/3: parsed (centre'))!;
    expect(parsed).toContain('"size":"205/55 R16"');
    expect(parsed).toContain('"loadSpeed":"91V"');
    expect(parsed).toContain('"dotTin":"no DOT marker read (DOT or a listed misread)"');
    expect(out.find(m => m.includes('make: not suggested'))).toContain('no frame gave a valid read');
    expect(out.some(m => m.includes('read done'))).toBe(true);
  });
});

describe('helpers', () => {
  test('centre crop: the middle 60% in whole pixels', () => {
    expect(centreCropRect(640, 360, 0.6)).toEqual({ x1: 128, y1: 72, x2: 512, y2: 288 });
    expect(centreCropRect(1, 1, 0.6)).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
  });

  test('best single size: most frames, then load/speed, then longer, then earliest', () => {
    const r = (value: string, score = 0) => ({ value, score });
    expect(bestSizeRead([])).toBeNull();
    expect(bestSizeRead([r('205/65 R16'), r('205/55 R16'), r('205/55 R16')])).toBe('205/55 R16');
    expect(bestSizeRead([r('205/65 R16'), r('205/55 R16', 1)])).toBe('205/55 R16');
    expect(bestSizeRead([r('265/70 R17'), r('LT265/70 R17')])).toBe('LT265/70 R17');
    expect(bestSizeRead([r('205/65 R16'), r('205/55 R16')])).toBe('205/65 R16');
  });
});

