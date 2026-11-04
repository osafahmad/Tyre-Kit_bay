import { parseDotAge, parseTyreSize } from '../parsers';

describe('parseTyreSize', () => {
  test('P215/65R15', () => {
    expect(parseTyreSize('P215/65R15')).toEqual({
      value: 'P215/65 R15',
      widthMm: 215,
      aspectRatio: 65,
      construction: 'R',
      rimInches: 15,
    });
  });

  test('215/65 R15', () => {
    expect(parseTyreSize('215/65 R15')).toMatchObject({ value: '215/65 R15', rimInches: 15 });
  });

  test('215/65ZR17', () => {
    expect(parseTyreSize('215/65ZR17')).toMatchObject({
      value: '215/65 ZR17',
      construction: 'ZR',
      rimInches: 17,
    });
  });

  test('lowercase OCR text inside other text', () => {
    expect(parseTyreSize('ecopia 215/65 r15 95h')?.value).toBe('215/65 R15');
  });

  test('invalid text', () => {
    expect(parseTyreSize('BRIDGESTONE')).toBeNull();
    expect(parseTyreSize('')).toBeNull();
    expect(parseTyreSize('7.50R16')).toBeNull(); // Commercial sizes need their own parser.
  });
});

describe('parseDotAge', () => {
  const now = new Date(Date.UTC(2026, 10, 4)); // 4 Nov 2026

  test('4B7K 2JX 2623 is week 26 of 2023', () => {
    expect(parseDotAge('4B7K 2JX 2623', now)).toEqual({
      week: 26,
      year: 2023,
      ageYears: 3,
      ageMonths: 4,
    });
  });

  test('spaces and punctuation are ignored', () => {
    expect(parseDotAge(' 4b7k-2jx 26 23 ', now)).toMatchObject({ week: 26, year: 2023 });
  });

  test('invalid week', () => {
    expect(parseDotAge('4B7K 2JX 5423', now)).toBeNull();
    expect(parseDotAge('4B7K 2JX 0023', now)).toBeNull();
  });

  test('future year', () => {
    expect(parseDotAge('4B7K 2JX 0127', now)).toBeNull();
  });

  test('made later this year than now', () => {
    expect(parseDotAge('5026', now)).toBeNull();
  });

  test('no date code', () => {
    expect(parseDotAge('DOT', now)).toBeNull();
  });
});
