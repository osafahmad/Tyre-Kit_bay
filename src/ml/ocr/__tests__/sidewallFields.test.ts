import {
  FIELD_BY_LABEL,
  agreedValue,
  dotCandidate,
  fieldCandidate,
  fullFrameDotCandidate,
  fullFrameMakeCandidate,
  fullFrameSizeCandidate,
  nameCandidate,
  sizeCandidate,
} from '../sidewallFields';
import type { OcrLineLike } from '../textCandidates';

const NOW = new Date(Date.UTC(2026, 10, 6));
const line = (text: string, y = 0, height = 20, x = 0): OcrLineLike => ({
  text,
  frame: { x, y, width: 100, height },
});

test('detector labels map to fields', () => {
  expect(FIELD_BY_LABEL).toEqual({ Brand: 'make', 'Dot-Code': 'dotTin', Model: 'model', Size: 'size' });
});

describe('size', () => {
  test('uses the tyre size parser', () => {
    expect(sizeCandidate([line('205/55R16 91V')])).toBe('205/55 R16');
    expect(sizeCandidate([line('MADE IN'), line('lt265/70 r17', 30)])).toBe('LT265/70 R17');
  });

  test('joins lines when OCR splits the size', () => {
    expect(sizeCandidate([line('R16', 0, 20, 120), line('205/55', 0, 20, 0)])).toBe('205/55 R16');
  });

  test('no size-shaped text → no suggestion', () => {
    expect(sizeCandidate([line('TUBELESS'), line('2O5/55R16')])).toBeNull();
  });
});

describe('DOT/TIN', () => {
  test('full TIN, DOT prefix removed, as read', () => {
    expect(dotCandidate([line('DOT 4B 7Y'), line('ABC 2319', 30)], NOW)).toBe('4B 7Y ABC 2319');
  });

  test('date code alone is a valid read', () => {
    expect(dotCandidate([line('2319')], NOW)).toBe('2319');
  });

  test('rejects invalid date codes and wrong lengths', () => {
    expect(dotCandidate([line('DOT 4B7Y ABC 5719')], NOW)).toBeNull(); // week 57
    expect(dotCandidate([line('DOT 4B7Y ABC 0127')], NOW)).toBeNull(); // future year
    expect(dotCandidate([line('DOT 4B7Y ABC23I9')], NOW)).toBeNull(); // I not swapped for 1
    expect(dotCandidate([line('319')], NOW)).toBeNull();
    expect(dotCandidate([line('DOT ABCDEFGHIJK 2319')], NOW)).toBeNull(); // 15 chars
  });
});

describe('make / model', () => {
  test('the tallest line with letters, as read', () => {
    expect(nameCandidate([line('RADIAL', 0, 12), line('Michelin', 20, 40), line('ok', 70, 8)])).toBe('Michelin');
  });

  test('ignores lines without at least two letters, or too long', () => {
    expect(nameCandidate([line('91V', 0, 60), line('Primacy  4', 70, 30)])).toBe('Primacy 4');
    expect(nameCandidate([line('1'), line('X'.repeat(31))])).toBeNull();
  });
});

test('no OCR lines → no candidate for any field', () => {
  for (const f of ['size', 'dotTin', 'make', 'model'] as const) {
    expect(fieldCandidate(f, [], NOW)).toBeNull();
  }
});

describe('agreement across frames', () => {
  test('needs enough matching reads (ignoring case and spaces)', () => {
    expect(agreedValue([{ value: 'MICHELIN', score: 0.9 }], 2)).toBeNull();
    expect(
      agreedValue(
        [
          { value: 'MICHELIN', score: 0.6 },
          { value: 'Michelin', score: 0.9 },
          { value: 'MICHELN', score: 0.95 },
        ],
        2,
      ),
    ).toBe('Michelin');
  });

  test('ties go to the higher total score', () => {
    expect(
      agreedValue(
        [
          { value: 'A1', score: 0.3 },
          { value: 'B2', score: 0.9 },
          { value: 'A1', score: 0.3 },
          { value: 'B2', score: 0.4 },
        ],
        2,
      ),
    ).toBe('B2');
  });
});

describe('full-frame parsers', () => {
  test('size: one line at a time, real tyre ranges only', () => {
    expect(fullFrameSizeCandidate([line('MICHELIN'), line('205/55R16 91V', 30)])).toBe('205/55 R16');
    // Joined with a rim read on the same row or the next line (owner request, round 5).
    expect(fullFrameSizeCandidate([line('205/55'), line('R16', 0, 20, 120)])).toBe('205/55 R16');
    expect(fullFrameSizeCandidate([line('205/55'), line('MADE IN'), line('R16', 60)])).toBeNull();
    expect(fullFrameSizeCandidate([line('900/99R40')])).toBeNull();
    expect(fullFrameSizeCandidate([line('100/90R17')])).toBe('100/90 R17'); // motorcycle
    expect(fullFrameSizeCandidate([line('095/90R17')])).toBeNull(); // width below 100
  });

  test('DOT: needs a line starting with DOT and a whole TIN, maybe wrapped to the next line', () => {
    expect(fullFrameDotCandidate([line('DOT 4B7Y ABC 2319')], NOW)).toBe('4B7Y ABC 2319');
    expect(fullFrameDotCandidate([line('DOT 4B7Y ABC'), line('2319', 30)], NOW)).toBe('4B7Y ABC 2319');
    expect(fullFrameDotCandidate([line('4B7Y ABC 2319')], NOW)).toBeNull(); // no DOT
    expect(fullFrameDotCandidate([line('DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124'); // device tyre
    expect(fullFrameDotCandidate([line('DOT 2319')], NOW)).toBeNull(); // too short
    expect(fullFrameDotCandidate([line('ENDOT 4B7Y ABC 2319')], NOW)).toBeNull();
    expect(fullFrameDotCandidate([line('DOT 4B7Y ABC 5719')], NOW)).toBeNull(); // week 57
  });
});

describe('OCR misreads around DOT', () => {
  test('stray characters before the word DOT are dropped', () => {
    expect(fullFrameDotCandidate([line('. DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(fullFrameDotCandidate([line('4 DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(fullFrameDotCandidate([line('~DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(dotCandidate([line('i. DOT 1Y6 032MKT 0124')], NOW)).toBe('1Y6 032MKT 0124');
  });

  test('DOT glued to letters is not the DOT word', () => {
    expect(fullFrameDotCandidate([line('ENDOT 1Y6 032MKT 0124')], NOW)).toBeNull();
    expect(fullFrameDotCandidate([line('DOTX 1Y6 032MKT 0124')], NOW)).toBeNull();
  });

  test('a letter O as the first date-code character is read as 0 (CLAUDE.md exception)', () => {
    expect(fullFrameDotCandidate([line('DOT 1Y6 032MKT O124')], NOW)).toBe('1Y6 032MKT 0124');
    expect(dotCandidate([line('DOT 1Y6 032MKT o124')], NOW)).toBe('1Y6 032MKT 0124');
  });

  test('no other swaps: O elsewhere, other letters, invalid results', () => {
    expect(dotCandidate([line('DOT 1Y6 032MKT 0O24')], NOW)).toBeNull(); // O at position 2
    expect(dotCandidate([line('DOT 1Y6 032MKT D124')], NOW)).toBeNull(); // D is not fixed
    expect(dotCandidate([line('DOT 1Y6 032MKT Q124')], NOW)).toBeNull();
    expect(dotCandidate([line('DOT 1Y6 032MKT O127')], NOW)).toBeNull(); // 0127 is a future year
    expect(dotCandidate([line('DOT 1Y6 O32MKT 0124')], NOW)).toBe('1Y6 O32MKT 0124'); // TIN body kept as read
  });

  test('device DOT crop: misread marker glued to the TIN, date code on its own line', () => {
    expect(dotCandidate([line('D0TYG09RURT'), line('O124', 30)], NOW, 'crop')).toBe('YG09RURT 0124');
    expect(dotCandidate([line('1D0T 1Y6 032MKT 0124')], NOW, 'crop')).toBe('1Y6 032MKT 0124');
    expect(dotCandidate([line('D07 1Y6 032MKT 0124')], NOW, 'crop')).toBe('1Y6 032MKT 0124');
    expect(dotCandidate([line('DQT1Y6032MKT0124')], NOW, 'crop')).toBe('1Y6032MKT0124');
  });

  test('glued marker variants are only dropped in crops, not whole frames', () => {
    expect(fullFrameDotCandidate([line('D0TYG09RURT O124')], NOW)).toBeNull();
  });
});

describe('make from a whole frame: known brand names only', () => {
  test('exact whole-word brand, as read', () => {
    expect(fullFrameMakeCandidate([line('OUTSIDE'), line('Continental', 30, 40)])).toBe('Continental');
    expect(fullFrameMakeCandidate([line('MICHELIN X-ICE')])).toBe('MICHELIN');
    expect(fullFrameMakeCandidate([line('general  tire')])).toBe('general tire');
  });

  test('fragments, look-alikes and other words never match', () => {
    for (const text of ['iental', 'Contnental', 'Comfortcontact', 'OUTSIDE', 'RADIAL TUBELESS', 'Continentals', 'XContinental']) {
      expect(fullFrameMakeCandidate([line(text)])).toBeNull();
    }
  });

  test('the most prominent brand line wins', () => {
    expect(fullFrameMakeCandidate([line('Made for Pirelli', 0, 10), line('Bridgestone', 30, 50)])).toBe('Bridgestone');
  });
});

describe('OCR noise normalisation', () => {
  const { cleanOcrText, readKey } = require('../sidewallFields') as typeof import('../sidewallFields');

  test('trims punctuation at the ends and collapses spaces; letters and digits unchanged', () => {
    expect(cleanOcrText(' -Primacy   4. ')).toBe('Primacy 4');
    expect(cleanOcrText('“ComfortContact”')).toBe('ComfortContact');
    expect(cleanOcrText('X-ICE')).toBe('X-ICE');
    expect(cleanOcrText('O124')).toBe('O124'); // never swapped
    expect(cleanOcrText('...')).toBe('');
  });

  test('agreement keys ignore case, spaces and punctuation', () => {
    expect(readKey('Primacy 4.')).toBe(readKey('PRIMACY4'));
    expect(nameCandidate([line('ComfortContact CC7 .')])).toBe('ComfortContact CC7');
  });
});

describe('brand in a Brand crop (CLAUDE.md exception)', () => {
  const { brandCandidate } = require('../sidewallFields') as typeof import('../sidewallFields');

  test('contained brand → canonical name', () => {
    expect(brandCandidate([line('CONTINENTAL')])).toBe('Continental');
    expect(brandCandidate([line('-Michelin.')])).toBe('Michelin');
    expect(brandCandidate([line('CONTI NENTAL')])).toBe('Continental'); // spacing ignored
  });

  test('one OCR error in a 6+ letter brand → canonical name', () => {
    expect(brandCandidate([line('Contnental')])).toBe('Continental');
    expect(brandCandidate([line('Bridgcstone')])).toBe('Bridgestone');
    expect(brandCandidate([line('Hankok')])).toBe('Hankook');
  });

  test('logo fragments clearly from one brand → canonical name (device reads)', () => {
    for (const read of ['Ontnem', 'OntneNaj', 'TLenta', 'iental', 'Cntnental']) {
      expect(brandCandidate([line(read)])).toBe('Continental');
    }
  });

  test('corrupt or short fragments that match no brand clearly are left empty', () => {
    expect(brandCandidate([line('OnteM')])).toBeNull(); // covers too little of Continental
    expect(brandCandidate([line('val')])).toBeNull(); // too short
    expect(brandCandidate([line('Toyu')])).toBeNull(); // 4 letters: no fuzzy, too short for fragments
    expect(brandCandidate([line('RADIAL'), line('OUTSIDE')])).toBeNull();
  });

  test('ambiguous matches are left empty', () => {
    expect(brandCandidate([line('Abcdex')], ['Abcdef', 'Abcdeg'])).toBeNull();
    // "RIDGSTONE"-like fragment passes for both Bridgestone and Firestone-like names.
    expect(brandCandidate([line('Restone')], ['Firestone', 'Freestone'])).toBeNull();
  });

  test('unlisted brands are not suggested (the user types them)', () => {
    expect(brandCandidate([line('Ovation'), line('RADIAL', 0, 8)])).toBeNull();
  });

  test('common sidewall words never become a brand', () => {
    for (const word of ['RADIAL', 'TUBELESS', 'OUTSIDE', 'INSIDE', 'REINFORCED', 'MAX LOAD', 'STEEL BELTED', 'MADE IN GERMANY']) {
      expect(brandCandidate([line(word)])).toBeNull();
    }
  });

  test('the list has the expected brands, including Continental', () => {
    const { KNOWN_TYRE_BRANDS } = require('../../../config/tyreBrands') as typeof import('../../../config/tyreBrands');
    expect(KNOWN_TYRE_BRANDS).toEqual(expect.arrayContaining(['Continental', 'Michelin', 'Bridgestone', 'Roadstone']));
    expect(KNOWN_TYRE_BRANDS).not.toContain('GT Radial');
    expect(brandCandidate([line('ROADSTONE')])).toBe('Roadstone');
  });
});

describe('model agreement: near-identical reads group, digits must match', () => {
  const { nearSameModel } = require('../sidewallFields') as typeof import('../sidewallFields');
  const reads = (...values: string[]) => values.map((value, i) => ({ value, score: 0.9 - i * 0.01 }));

  test('similar spellings count together; the most frequent real read is chosen', () => {
    expect(agreedValue(reads('ComfortContact', 'Comfortcontact'), 2, undefined, nearSameModel)).toBe(
      'ComfortContact',
    );
    expect(agreedValue(reads('ComfortContac', 'ComfortContact', 'ComfortContact'), 2, undefined, nearSameModel)).toBe(
      'ComfortContact',
    );
    expect(agreedValue(reads('Primacy 4', 'Primacy4.'.replace('.', '')), 2, undefined, nearSameModel)).toBe('Primacy 4');
  });

  test('different digits never merge, even at distance 1', () => {
    expect(nearSameModel('Primacy 3', 'Primacy 4')).toBe(false);
    expect(agreedValue(reads('Primacy 3', 'Primacy 4'), 2, undefined, nearSameModel)).toBeNull();
    expect(nearSameModel('CC7', 'CC5')).toBe(false);
  });

  test('distance limits: 2 for 6+ characters, 1 for shorter', () => {
    expect(nearSameModel('Ecopia', 'Ecpa')).toBe(false); // distance 2, short key
    expect(nearSameModel('Turanza', 'Turnza')).toBe(true);
    expect(nearSameModel('Turanza', 'Truanza')).toBe(true); // distance 2, both 7 letters
    expect(nearSameModel('Turanza', 'Trnza')).toBe(false); // shorter key is 5 letters → limit 1
    expect(nearSameModel('Sport', 'Spor')).toBe(true);
    expect(nearSameModel('Sport', 'Spr')).toBe(false);
  });

  test('without grouping, near-identical reads do not agree', () => {
    expect(agreedValue(reads('ComfortContac', 'ComfortContact'), 2)).toBeNull();
  });
});

describe('size recovery (round 5)', () => {
  const { recoverSize } = require('../sidewallFields') as typeof import('../sidewallFields');
  const rows = (...texts: string[]) => texts.map((t, i) => line(t, i * 30));

  test('full width/aspect joined with a rim on the same or adjacent line', () => {
    expect(recoverSize(rows('195/55', 'R 15 85V'))).toBe('195/55 R15');
    expect(recoverSize(rows('R15 85V', '195/55'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55 xx R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('195/55', 'OUTSIDE', 'R15'))).toBeNull(); // not adjacent
  });

  test('device reads: missing hundreds digit inferred only with a rim R13–R17 nearby', () => {
    expect(recoverSize(rows('A95/55', 'R154'))).toBe('195/55 R15'); // stray digit after the rim
    expect(recoverSize(rows('95/55 R15'))).toBe('195/55 R15');
    expect(recoverSize(rows('H85/65', 'R14'))).toBe('185/65 R14');
    expect(recoverSize(rows('05/55', 'R16'))).toBe('205/55 R16');
    expect(recoverSize(rows('25/45', 'R17'))).toBe('225/45 R17');
  });

  test('never inferred: no rim, big rims, or widths outside 175–225', () => {
    expect(recoverSize(rows('A95/55'))).toBeNull(); // no rim
    expect(recoverSize(rows('A95/55', '81545Vt'))).toBeNull(); // device line without a readable rim
    expect(recoverSize(rows('85/45', 'R20'))).toBeNull(); // likely 285: rim gate
    expect(recoverSize(rows('95/55', 'R18'))).toBeNull();
    expect(recoverSize(rows('65/65', 'R15'))).toBeNull(); // 165 not allowed
    expect(recoverSize(rows('35/55', 'R15'))).toBeNull(); // 235 not allowed
  });

  test('a full width read is never changed', () => {
    expect(recoverSize(rows('295/55', 'R15'))).toBe('295/55 R15');
    expect(recoverSize(rows('A95/6S R15'))).toBeNull(); // aspect misread: no healing of S→5
  });

  test('Size crop with the model text plus a wider read of the numbers', () => {
    expect(sizeCandidate([line('rlConta'), line('A95/55', 30), line('R15', 60)])).toBe('195/55 R15');
    expect(sizeCandidate([line('Conta')])).toBeNull();
  });
});
