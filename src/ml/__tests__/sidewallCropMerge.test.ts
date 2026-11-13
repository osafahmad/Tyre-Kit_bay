import { cropFieldReads, cropSuggestions, mergeCropSuggestions } from '../sidewallCropMerge';
import { applyMergedSuggestions } from '../sidewallReader';
import { cropRead, judgeCrops, type CropRect } from '../services/sidewallCropOcr';
import type { SidewallCropResult } from '../services/SidewallTextDetector';

// Stage 3 (owner request 2026-11-13). Texts are the iPhone 13 reads of a
// mounted Continental ComfortContact 195/55 R15, DOT 0124.

const now = new Date('2026-11-13');
const L = (text: string, i = 0) => ({ text, frame: { x: 0, y: i * 30, width: 200, height: 24 } });

let nextBox = 0;
/** One crop, read at one orientation from the given lines, judged like `readCrops` does. */
function crop(label: string, texts: string[], score = 0.8, rect: CropRect = { x1: 0, y1: 0, x2: 100, y2: 40 }): SidewallCropResult {
  const best = cropRead(label, -90, texts.map((t, i) => L(t, i)), now);
  const [judged] = judgeCrops([{ label, crop: rect, best }]);
  return {
    detection: nextBox++,
    label,
    score,
    crop: rect,
    thumbnailPath: null,
    reads: [best],
    best,
    ocrMs: 1,
    verified: judged.verified,
    ignored: judged.ignored,
    overlappedBy: null,
  };
}

/** The four boxes the iPhone 13 run found on one frame. */
const goodFrame = () => [
  crop('Brand', ['Continental'], 0.93),
  crop('DOT', ['DOT: 1YG 092MKT', '0124'], 0.6),
  crop('Size', ['195/55 R15'], 0.8),
  crop('Model', ['ComfortContact'], 0.79),
];

describe('judgeCrops: empty-OCR and overlapping boxes', () => {
  test('a box whose 4 orientations read no letter or digit is unverified and ignored as no_text', () => {
    const empty = cropRead('Brand', 0, [], now);
    const dashes = cropRead('Brand', 90, [L('—  ·')], now);
    const [a, b] = judgeCrops([
      { label: 'Brand', crop: { x1: 0, y1: 0, x2: 10, y2: 10 }, best: empty },
      { label: 'Brand', crop: { x1: 50, y1: 0, x2: 60, y2: 10 }, best: dashes },
    ]);
    expect([a.verified, a.ignored, b.verified, b.ignored]).toEqual([false, 'no_text', false, 'no_text']);
    expect(judgeCrops([{ label: 'Size', crop: { x1: 0, y1: 0, x2: 1, y2: 1 }, best: null }])[0].ignored).toBe('no_text');
  });

  test('a weak box on the same text as a strongly verified box of another class is ignored as overlap', () => {
    const rect = { x1: 100, y1: 100, x2: 300, y2: 160 };
    const judged = judgeCrops([
      { label: 'Size', crop: rect, best: cropRead('Size', 0, [L('195/55 R15')], now) },
      { label: 'Model', crop: { ...rect, x2: 290 }, best: cropRead('Model', 0, [L('195/55 R15')], now) },
      { label: 'Brand', crop: { x1: 600, y1: 100, x2: 800, y2: 160 }, best: cropRead('Brand', 0, [L('xyz')], now) },
    ]);
    expect(judged.map(j => [j.label, j.verified, j.ignored, j.overlappedBy])).toEqual([
      ['Size', true, null, null],
      ['Model', true, 'overlap', 0],
      ['Brand', true, null, null], // weak, but overlaps nothing: kept (it gives no field anyway)
    ]);
  });

  test('two strongly verified boxes that overlap both stay (each parsed its own field)', () => {
    const rect = { x1: 0, y1: 0, x2: 200, y2: 60 };
    const judged = judgeCrops([
      { label: 'Brand', crop: rect, best: cropRead('Brand', 0, [L('Continental')], now) },
      { label: 'Model', crop: rect, best: cropRead('Model', 0, [L('ComfortContact')], now) },
    ]);
    expect(judged.map(j => j.ignored)).toEqual([null, null]);
  });
});

describe('cropFieldReads and cropSuggestions', () => {
  test('each box gives only its own field; two frames agreeing is agreed', () => {
    const s = cropSuggestions([goodFrame(), goodFrame()], 2);
    expect(s).toEqual({
      size: { value: '195/55 R15', basis: 'agreed', frames: 2 },
      dotTin: { value: '1YG 092MKT 0124', basis: 'agreed', frames: 2 },
      make: { value: 'Continental', basis: 'agreed', frames: 2 },
      model: { value: 'ComfortContact', basis: 'agreed', frames: 2 },
    });
  });

  test('ignored boxes give nothing: a false Brand box on tread rubber with no text is left out', () => {
    const frame = [crop('Brand', [], 0.95), crop('Size', ['195/55 R15'])];
    expect(frame[0].ignored).toBe('no_text');
    expect(cropSuggestions([frame], 2)).toEqual({ size: { value: '195/55 R15', basis: 'single', frames: 1 } });
  });

  test('a Size box that reads a DOT gives no DOT; a Model box names its brand only when no Brand box read one', () => {
    expect(cropFieldReads([[crop('Size', ['DOT 1NG D92WKT 0124'])]]).dotTin).toEqual([]);
    const onlyModel = cropSuggestions([[crop('Model', ['ComfortContact'])]], 2);
    expect(onlyModel.make).toEqual({ value: 'Continental', basis: 'single', frames: 1 });
    const both = cropFieldReads([[crop('Model', ['ComfortContact']), crop('Brand', ['Michelin'])]]);
    expect(both.make.map(r => r.value)).toEqual(['Michelin']);
  });

  test('two boxes on the same text in one frame are one read, not agreement', () => {
    const s = cropSuggestions([[crop('Size', ['195/55 R15'], 0.6), crop('Size', ['195/55 R15'], 0.8)]], 2);
    expect(s.size).toEqual({ value: '195/55 R15', basis: 'single', frames: 1 });
  });

  test('DOT/TIN: a single TIN is suggested only when no other crop read a different one', () => {
    expect(cropSuggestions([[crop('DOT', ['DOT 1NG D92WKT 0124'])]], 2).dotTin).toEqual({
      value: '1NG D92WKT 0124',
      basis: 'single',
      frames: 1,
    });
    const conflict = cropSuggestions([[crop('DOT', ['DOT 1NG D92WKT 0124'])], [crop('DOT', ['DOT 1YG 092MKT 0124'])]], 2);
    expect(conflict.dotTin).toBeUndefined();
  });
});

describe('mergeCropSuggestions', () => {
  test('owner case: crop 195/55 R15 replaces the whole frame’s single noisy 195/53 R15', () => {
    const crops = cropSuggestions([goodFrame()], 2);
    const { suggestions, decisions } = mergeCropSuggestions({ size: '195/53 R15' }, { size: 'single' }, crops);
    expect(suggestions.size).toBe('195/55 R15');
    expect(decisions.find(d => d.field === 'size')).toMatchObject({ chose: 'crop', fullFrame: '195/53 R15', crop: '195/55 R15' });
  });

  test('owner case: the whole TIN from a DOT crop replaces a date-code-only whole-frame read with the same date', () => {
    const crops = cropSuggestions([[crop('DOT', ['DOT 1NG D92WKT 0124'])]], 2);
    const { suggestions, decisions } = mergeCropSuggestions({ dotTin: '0124' }, { dotTin: 'date_code' }, crops);
    expect(suggestions.dotTin).toBe('1NG D92WKT 0124');
    expect(decisions[0].why).toMatch(/whole TIN with that date code/);
  });

  test('a single crop TIN with another date code does not replace the date code; agreed crops do', () => {
    const single = cropSuggestions([[crop('DOT', ['DOT 1NG D92WKT 0124'])]], 2);
    expect(mergeCropSuggestions({ dotTin: '3523' }, { dotTin: 'date_code' }, single).suggestions.dotTin).toBe('3523');
    const agreed = cropSuggestions([[crop('DOT', ['DOT 1NG D92WKT 0124'])], [crop('DOT', ['DOT 1NG D92WKT 0124'])]], 2);
    expect(mergeCropSuggestions({ dotTin: '3523' }, { dotTin: 'date_code' }, agreed).suggestions.dotTin).toBe('1NG D92WKT 0124');
  });

  test('a whole-frame value agreed by 2 frames beats a single crop read; agreed crops beat it', () => {
    const single = cropSuggestions([goodFrame()], 2);
    expect(mergeCropSuggestions({ size: '195/65 R15' }, { size: 'agreed' }, single).suggestions.size).toBe('195/65 R15');
    const agreed = cropSuggestions([goodFrame(), goodFrame()], 2);
    expect(mergeCropSuggestions({ size: '195/65 R15' }, { size: 'agreed' }, agreed).suggestions.size).toBe('195/55 R15');
  });

  test('crops fill make and model the whole frame missed; the same value keeps the whole frame’s spelling', () => {
    const crops = cropSuggestions([goodFrame()], 2);
    const { suggestions, decisions } = mergeCropSuggestions({ make: 'CONTINENTAL' }, { make: 'single' }, crops);
    expect(suggestions).toMatchObject({ make: 'CONTINENTAL', model: 'ComfortContact' });
    expect(decisions.find(d => d.field === 'make')?.chose).toBe('same');
    expect(decisions.find(d => d.field === 'model')?.chose).toBe('crop');
  });

  test('no crop value: the whole frame is kept untouched', () => {
    expect(mergeCropSuggestions({ size: '195/53 R15' }, { size: 'single' }, {})).toEqual({
      suggestions: { size: '195/53 R15' },
      decisions: [],
    });
  });
});

describe('applyMergedSuggestions', () => {
  const empty = { size: '', dotTin: '', make: '', model: '' };

  test('replaces only what this read filled, fills empty fields, never a touched or earlier-confirmed field', () => {
    const current = { size: '195/53 R15', dotTin: '0124', make: 'Pirelli', model: '' };
    const filled = { size: '195/53 R15', dotTin: '0124' }; // make 'Pirelli' was confirmed on an earlier scan
    const merged = { size: '195/55 R15', dotTin: '1NG D92WKT 0124', make: 'Continental', model: 'ComfortContact' };
    expect(applyMergedSuggestions(current, merged, filled, new Set())).toEqual({
      size: '195/55 R15',
      dotTin: '1NG D92WKT 0124',
      make: 'Pirelli',
      model: 'ComfortContact',
    });
    expect(applyMergedSuggestions(current, merged, filled, new Set(['size']))).toMatchObject({ size: '195/53 R15' });
    expect(applyMergedSuggestions(empty, {}, {}, new Set())).toEqual(empty);
  });
});
