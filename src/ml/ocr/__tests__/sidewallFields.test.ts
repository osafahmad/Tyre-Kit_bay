import {
  agreedValue,
  dotCandidate,
  fullFrameDotCandidate,
  fullFrameMakeCandidate,
  fullFrameSizeCandidate,
} from '../sidewallFields';
import type { OcrLineLike } from '../textCandidates';

const NOW = new Date(Date.UTC(2026, 10, 6));
const line = (text: string, y = 0, height = 20, x = 0): OcrLineLike => ({
  text,
  frame: { x, y, width: 100, height },
});

describe('size', () => {
  test('uses the tyre size parser', () => {
    expect(fullFrameSizeCandidate([line('205/55R16 91V')])).toBe('205/55 R16');
    expect(fullFrameSizeCandidate([line('MADE IN'), line('lt265/70 r17', 30)])).toBe('LT265/70 R17');
  });

  test('joins lines when OCR splits the size', () => {
    expect(fullFrameSizeCandidate([line('R16', 0, 20, 120), line('205/55', 0, 20, 0)])).toBe('205/55 R16');
  });

  test('no size-shaped text → no suggestion', () => {
    expect(fullFrameSizeCandidate([line('TUBELESS'), line('2O5/55R16')])).toBeNull();
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

test('no OCR lines → no candidate for any field', () => {
  expect(fullFrameSizeCandidate([])).toBeNull();
  expect(fullFrameDotCandidate([], NOW)).toBeNull();
  expect(fullFrameMakeCandidate([])).toBeNull();
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

  test('misread, glued DOT markers are not the DOT word, so nothing is read', () => {
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

  test('the list has the expected brands', () => {
    const { KNOWN_TYRE_BRANDS } = require('../../../config/tyreBrands') as typeof import('../../../config/tyreBrands');
    expect(KNOWN_TYRE_BRANDS).toEqual(expect.arrayContaining(['Continental', 'Michelin', 'Bridgestone', 'Roadstone']));
    expect(KNOWN_TYRE_BRANDS).not.toContain('GT Radial');
    expect(fullFrameMakeCandidate([line('ROADSTONE')])).toBe('ROADSTONE');
  });
});

describe('agreement keys', () => {
  const { readKey } = require('../sidewallFields') as typeof import('../sidewallFields');

  test('ignore case, spaces and punctuation', () => {
    expect(readKey('Primacy 4.')).toBe(readKey('PRIMACY4'));
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

});
