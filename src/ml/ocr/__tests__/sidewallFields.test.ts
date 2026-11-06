import {
  FIELD_BY_LABEL,
  agreedValue,
  dotCandidate,
  fieldCandidate,
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
