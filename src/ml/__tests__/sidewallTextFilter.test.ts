import type { OcrResult } from 'rn-mlkit-ocr';
import { ocrResultLines } from '../ocr/ocr';
import {
  brandRootCandidate,
  explainRejections,
  filterSidewallText,
  loadSpeedAfterSize,
  rankedSizeCandidate,
} from '../sidewallTextFilter';

// Fixtures are in rn-mlkit-ocr's `recognizeText` result shape (blocks → lines
// → elements, frames in image pixels), flattened by `ocrResultLines` exactly
// as `recognizeLines` does on the phone. Text is synthetic, modelled on the
// device reads in DECISIONS.md; it is not a recorded phone output.

const NOW = new Date(Date.UTC(2026, 10, 10));

type LineSpec = { text: string; x?: number; y: number; h?: number; w?: number };

/** One ML Kit block per group of lines; elements split on spaces. */
function mlKitResult(...blocks: LineSpec[][]): OcrResult {
  return {
    text: blocks.map(b => b.map(l => l.text).join('\n')).join('\n'),
    blocks: blocks.map(lines => {
      const ml = lines.map(({ text, x = 0, y, h = 20, w = text.length * 12 }) => ({
        text,
        frame: { x, y, width: w, height: h },
        elements: text.split(' ').map((t, i) => ({ text: t, frame: { x: x + i * 40, y, width: t.length * 12, height: h } })),
      }));
      const top = Math.min(...ml.map(l => l.frame.y));
      const bottom = Math.max(...ml.map(l => l.frame.y + l.frame.height));
      return {
        text: lines.map(l => l.text).join('\n'),
        frame: { x: 0, y: top, width: Math.max(...ml.map(l => l.frame.width)), height: bottom - top },
        lines: ml,
      };
    }),
  };
}

const read = (result: OcrResult) => filterSidewallText(ocrResultLines(result), NOW);

describe('standard clean sidewall', () => {
  test('size, load/speed, DOT and brand from separate blocks', () => {
    const result = mlKitResult(
      [{ text: 'Continental', y: 0, h: 60 }, { text: 'ComfortContact CC7', y: 70, h: 30 }],
      [{ text: '195/55R15 85V', y: 120, h: 28 }],
      [{ text: 'DOT 1Y6 032MKT', y: 200, h: 14 }, { text: '0124', y: 218, h: 14 }],
    );
    expect(read(result)).toEqual({
      size: '195/55 R15',
      dotTin: '1Y6 032MKT 0124',
      make: 'Continental',
      model: 'ComfortContact CC7',
      modelCode: { family: 'ComfortContact', code: 'CC7' },
      loadSpeed: '85V',
    });
  });

  test.each([
    ['205/55R16 91V', '205/55 R16', '91V'],
    ['195/65 R15 91H', '195/65 R15', '91H'],
    ['225/45ZR17 94W', '225/45 ZR17', '94W'],
    ['LT265/70R17 121/118S', 'LT265/70 R17', '121/118S'],
    ['245/40R18 97(Y)', '245/40 R18', '97Y'],
  ])('%s → %s, %s', (text, size, loadSpeed) => {
    expect(read(mlKitResult([{ text, y: 0 }]))).toMatchObject({ size, loadSpeed });
  });

  test('every brand the owner listed is matched exactly as read, case kept', () => {
    for (const brand of ['MICHELIN', 'Bridgestone', 'GOODYEAR', 'Pirelli', 'DUNLOP', 'Hankook', 'YOKOHAMA', 'Falken', 'TOYO', 'General Tire']) {
      expect(read(mlKitResult([{ text: brand, y: 0 }])).make).toBe(brand);
    }
  });

  test('model: only a listed family in its listed spelling; a bare number is never added (owner 2026-11-11)', () => {
    expect(read(mlKitResult([{ text: 'Primacy 4', y: 0, h: 80 }]))).toEqual({
      size: null,
      dotTin: null,
      make: 'Michelin', // a matched family names its brand (owner 2026-11-11)
      model: 'Primacy',
      modelCode: null,
      loadSpeed: null,
    });
    expect(read(mlKitResult([{ text: 'Comfort Contact', y: 0 }])).model).toBe('ComfortContact');
    expect(read(mlKitResult([{ text: 'COMFORTCONTACT', y: 0 }, { text: 'CC7', y: 30 }])).model).toBe('ComfortContact CC7');
    expect(read(mlKitResult([{ text: 'CC7', y: 0 }]))).toMatchObject({ model: null, modelCode: { family: 'ComfortContact', code: 'CC7' } });
    for (const text of ['orContact', 'Contact', 'Primacy4', 'SOME OTHER MODEL']) {
      expect(read(mlKitResult([{ text, y: 0 }])).model).toBeNull();
    }
    // Within the noise rule (owner 2026-11-11): one stray letter still gives the listed spelling, and its brand.
    expect(read(mlKitResult([{ text: 'ComfortContacts', y: 0 }]))).toMatchObject({ model: 'ComfortContact', make: 'Continental' });
    expect(read(mlKitResult([{ text: 'Comfortontact', y: 0 }]))).toMatchObject({ model: 'ComfortContact', make: 'Continental' });
  });
});

describe('split size tokens across lines', () => {
  test('width/aspect on one line, rim and load/speed on the next', () => {
    const result = mlKitResult([{ text: '205/55', y: 100 }, { text: 'R16 91V', y: 124 }]);
    expect(read(result)).toMatchObject({ size: '205/55 R16', loadSpeed: '91V' });
  });

  test('rim to the right on the same row, in its own block', () => {
    const result = mlKitResult([{ text: '195/65', x: 0, y: 100 }], [{ text: 'R15', x: 120, y: 102 }]);
    expect(read(result)).toMatchObject({ size: '195/65 R15', loadSpeed: null });
  });

  test('a load/speed index after another rim is not attributed to the size', () => {
    const result = mlKitResult([{ text: '205/55', y: 100 }, { text: 'R16', y: 124 }], [{ text: 'R15 88T', y: 400 }]);
    expect(read(result)).toMatchObject({ size: '205/55 R16', loadSpeed: null });
  });

  test('pieces more than two lines apart are never joined', () => {
    const result = mlKitResult([
      { text: '205/55', y: 100 },
      { text: 'OUTSIDE', y: 124 },
      { text: 'TUBELESS', y: 148 },
      { text: 'R16', y: 172 },
    ]);
    expect(read(result).size).toBeNull();
  });

  test('missing width hundreds digit: completed only with a rim R13–R17 (CLAUDE.md exception)', () => {
    expect(read(mlKitResult([{ text: 'A95/55', y: 0 }, { text: 'R15', y: 24 }])).size).toBe('195/55 R15');
    expect(read(mlKitResult([{ text: '85/45', y: 0 }, { text: 'R20', y: 24 }])).size).toBeNull();
  });
});

describe('dusty / noisy frames with rim and other text', () => {
  /** Wheel stamp, pressure and load text around a dusty sidewall read. */
  const noisy = mlKitResult(
    [{ text: 'ET45 15x6J 100/45 R15', y: 10, h: 10 }], // rim stamp that happens to parse as a size
    [{ text: 'MAX LOAD 615 KG (1356 LBS)', y: 40, h: 12 }, { text: 'MAX PRESS 350 kPa (51 PSI)', y: 56, h: 12 }],
    [{ text: '.: TWI', y: 90, h: 10 }],
    [{ text: '195/65R15 91H', y: 120, h: 30 }],
    [{ text: 'TUBELESS RADIAL', y: 170, h: 14 }],
    [{ text: "DOT EX 2H 4KR '3721", y: 200, h: 16 }],
    [{ text: 'bridgestone', y: 240, h: 26 }],
  );

  test('the size with a load/speed index beats rim text, whatever the reading order', () => {
    expect(read(noisy)).toEqual({
      size: '195/65 R15',
      dotTin: 'EX 2H 4KR 3721',
      make: 'bridgestone',
      model: null,
      modelCode: null,
      loadSpeed: '91H',
    });
  });

  test('without load/speed on either, the taller (more prominent) text wins', () => {
    const lines = ocrResultLines(
      mlKitResult([{ text: '100/45 R15', y: 0, h: 10 }], [{ text: '195/65 R15', y: 50, h: 30 }]),
    );
    expect(rankedSizeCandidate(lines)).toEqual({ value: '195/65 R15', loadSpeed: null });
  });

  test('load and pressure numbers never become a size, load index or DOT', () => {
    const result = mlKitResult(
      [{ text: 'MAX LOAD 615 KG (1356 LBS)', y: 0 }],
      [{ text: 'MAX PRESS 350 kPa (51 PSI)', y: 30 }],
      [{ text: 'TREADWEAR 400 TRACTION A TEMPERATURE A', y: 60 }],
    );
    expect(read(result)).toEqual({ size: null, dotTin: null, make: null, model: null, modelCode: null, loadSpeed: null });
  });

  test('misread characters are never swapped into a size or brand', () => {
    const result = mlKitResult([{ text: '2O5/55R16 91V', y: 0 }], [{ text: 'Bridgcstone', y: 40 }]);
    expect(read(result)).toMatchObject({ size: null, make: null });
  });

  test('a DOT/TIN date code in the future or with a bad week is rejected', () => {
    expect(read(mlKitResult([{ text: 'DOT EX2H 4KR 5719', y: 0 }])).dotTin).toBeNull();
    expect(read(mlKitResult([{ text: 'DOT EX2H 4KR 0127', y: 0 }])).dotTin).toBeNull();
  });
});

describe('load / speed index', () => {
  test('read only right after a size, as a whole token', () => {
    expect(loadSpeedAfterSize('205/55R16 91V XL')).toBe('91V');
    expect(loadSpeedAfterSize('205/55R16 91VX')).toBeNull();
    expect(loadSpeedAfterSize('205/55R16 XL 91V')).toBeNull();
    expect(loadSpeedAfterSize('91V')).toBeNull(); // no size on the line
  });

  test('I, O and X are not speed symbols; load indexes above 279 are not real', () => {
    expect(loadSpeedAfterSize('205/55R16 91X')).toBeNull();
    expect(loadSpeedAfterSize('205/55R16 91O')).toBeNull();
    expect(loadSpeedAfterSize('205/55R16 300V')).toBeNull();
  });
});

describe('iPhone 13 Continental 195/55 R15 85V (owner decision 2026-11-10)', () => {
  // Reads taken from the [SidewallOCR] device logs; layout is synthetic.
  test('split size with the load/speed glued to the rim', () => {
    const result = mlKitResult([{ text: '195/55', y: 100, h: 30 }], [{ text: 'tinentals', y: 20 }], [{ text: 'R1585V', y: 134, h: 30 }]);
    expect(read(result)).toMatchObject({ size: '195/55 R15', loadSpeed: '85V', make: 'Continental' });
  });

  test('brand roots: Continental, Michelin, Bridgestone, Goodyear', () => {
    const make = (text: string) => brandRootCandidate(ocrResultLines(mlKitResult([{ text, y: 0 }])));
    expect(make('tinentals')).toBe('Continental');
    expect(make('xICHELINy')).toBe('Michelin');
    expect(make('BRIDGESTONF')).toBe('Bridgestone');
    expect(make('goodyearr')).toBe('Goodyear');
  });

  test('shorter fragments and model tokens give no make', () => {
    for (const text of ['ienla', 'Lental', 'Comfortco', 'Comfortc', 'coniactc']) {
      expect(read(mlKitResult([{ text, y: 0 }])).make).toBeNull();
    }
  });

  test('round 2 roots and the Contact model word (owner decision 2026-11-10)', () => {
    for (const text of ['inental', 'ntinenals', 'tinenlal', 'nentalY', 'Contact', 'COntact', 'orContact', 'IContact', 'ComfortContact', 'oricontact']) {
      expect(read(mlKitResult([{ text, y: 0 }])).make).toBe('Continental');
    }
  });

  test('a brand name or root beats a model-family word', () => {
    expect(read(mlKitResult([{ text: 'ComfortContact', y: 0, h: 60 }, { text: 'MICHELIN', y: 80 }])).make).toBe('MICHELIN');
  });

  test('B read for R in a split rim (owner decision 2026-11-10)', () => {
    expect(read(mlKitResult([{ text: '95/55', y: 0 }, { text: '5B15 85VE C', y: 24 }])).size).toBe('195/55 R15');
    expect(read(mlKitResult([{ text: '195/55', y: 0 }, { text: 'B16', y: 24 }])).size).toBe('195/55 R16');
  });

  test('a brand read whole is kept as read, before any root', () => {
    expect(read(mlKitResult([{ text: 'CONTINENTAL', y: 0 }])).make).toBe('CONTINENTAL');
  });

  test('misread DOT prefix', () => {
    expect(read(mlKitResult([{ text: 'ODTS 1Y6 032MKT 0124', y: 0 }])).dotTin).toBe('1Y6 032MKT 0124');
  });

  test('round 10: rejection reasons for the iPhone 13 / Redmi 13 size lines', () => {
    const outside = ocrResultLines(mlKitResult([{ text: '495/35 R1585VLT:', y: 0 }]));
    expect(explainRejections(outside, filterSidewallText(outside, NOW)).size).toContain('"495/35"');
    expect(explainRejections(outside, filterSidewallText(outside, NOW)).size).toContain('outside 100–395');
    const noRim = ocrResultLines(mlKitResult([{ text: 'ES 195/55', y: 0 }, { text: '3R585V', y: 30 }]));
    expect(explainRejections(noRim, filterSidewallText(noRim, NOW)).size).toContain('no rim 13–22 read');
    const ok = ocrResultLines(mlKitResult([{ text: 'ES 195/55 3R1585VLT:', y: 0 }]));
    expect(filterSidewallText(ok, NOW).size).toBe('195/55 R15');
    expect(explainRejections(ok, filterSidewallText(ok, NOW))).not.toHaveProperty('size');
  });

  test('round 10: POT and 00T markers locate the TIN', () => {
    expect(read(mlKitResult([{ text: 'POT 4B8R 1222', y: 0 }])).dotTin).toBe('4B8R 1222');
    expect(read(mlKitResult([{ text: 'x00T 4B8R 1222', y: 0 }])).dotTin).toBe('4B8R 1222');
  });

  test('rejection reasons name the new rules', () => {
    const lines = ocrResultLines(mlKitResult([{ text: 'oottDE', y: 0 }, { text: 'ienla', y: 30 }]));
    expect(explainRejections(lines, filterSidewallText(lines, NOW))).toMatchObject({
      dotTin: expect.stringContaining('OOTTDE'),
      make: expect.stringContaining('brand root'),
    });
  });
});

test('no text → nothing', () => {
  expect(read({ text: '', blocks: [] })).toEqual({ size: null, dotTin: null, make: null, model: null, modelCode: null, loadSpeed: null });
});

describe('Purfect KB-27, size with a space after R (owner request 2026-11-12, iPhone 13)', () => {
  test('`185/65 R 15 88H`, `PURFECT` and `KB-27` are all read', () => {
    const lines = ocrResultLines(
      mlKitResult([
        { text: 'PURFECT', y: 0, h: 60 },
        { text: 'KB-27', y: 80, h: 30 },
        { text: '185/65 R 15 88H', y: 130 },
      ]),
    );
    const r = filterSidewallText(lines, NOW);
    expect(r.size).toBe('185/65 R15');
    expect(r.loadSpeed).toBe('88H');
    expect(r.make).toBe('PURFECT');
    expect(r.model).toBe('KB-27');
  });

  test('more than one space, and a rim split from its load/speed line', () => {
    expect(rankedSizeCandidate(ocrResultLines(mlKitResult([{ text: '185/65 R  15 88H', y: 0 }])))).toEqual({
      value: '185/65 R15',
      loadSpeed: '88H',
    });
    const split = ocrResultLines(mlKitResult([{ text: '185/65', y: 0 }, { text: 'R 15 88H', y: 30 }]));
    expect(rankedSizeCandidate(split)).toEqual({ value: '185/65 R15', loadSpeed: '88H' });
  });

  test('KB27 and KB 27 give the listed spelling; the model gives Purfect as make', () => {
    for (const text of ['KB27', 'kb 27']) {
      const r = filterSidewallText(ocrResultLines(mlKitResult([{ text, y: 0 }])), NOW);
      expect(r.model).toBe('KB-27');
      expect(r.make).toBe('Purfect');
    }
    // Digits glued on are not the model.
    expect(filterSidewallText(ocrResultLines(mlKitResult([{ text: 'KB270', y: 0 }])), NOW).model).toBeNull();
  });

  test('regional brands asked for are listed', () => {
    for (const brand of ['Servis', 'Panther', 'Sailun', 'Triangle', 'Linglong', 'Goodride', 'Chaoyang', 'Kumho', 'Nexen', 'Giti', 'Maxxis', 'Toyo', 'Falken', 'Nankang', 'General Tire']) {
      expect(filterSidewallText(ocrResultLines(mlKitResult([{ text: brand.toUpperCase(), y: 0 }])), NOW).make).toBe(
        brand.toUpperCase(),
      );
    }
  });
});
