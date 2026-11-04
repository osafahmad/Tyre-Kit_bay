import { formatAge, formatRelativeDateTime, tyreDetailLine } from '../format';

test('relative dates', () => {
  const now = new Date(2026, 10, 4, 12, 0);
  expect(formatRelativeDateTime(new Date(2026, 10, 4, 11, 40), now)).toBe('Today, 11:40');
  expect(formatRelativeDateTime(new Date(2026, 10, 3, 16, 20), now)).toBe('Yesterday, 16:20');
  expect(formatRelativeDateTime(new Date(2026, 10, 2, 10, 5), now)).toBe('2 Nov, 10:05');
});

test('age', () => {
  expect(formatAge({ ageYears: 3, ageMonths: 4 })).toBe('3 years 4 months');
  expect(formatAge({ ageYears: 1, ageMonths: 0 })).toBe('1 year');
  expect(formatAge({ ageYears: 0, ageMonths: 1 })).toBe('1 month');
  expect(formatAge({ ageYears: null, ageMonths: null })).toBeNull();
});

test('detail line hides missing depth', () => {
  const base = {
    status: 'good' as const,
    treadConfidence: null,
    wearPattern: null,
    damageFound: null,
    damageConfidence: null,
    rimInches: null,
    make: null,
    model: null,
    dotTin: null,
    ageYears: null,
    ageMonths: null,
  };
  expect(tyreDetailLine({ ...base, treadDepthMm: 6.2, size: '215/65 R15' })).toBe(
    '6.2 mm · 215/65 R15',
  );
  expect(tyreDetailLine({ ...base, treadDepthMm: null, size: '215/65 R15' })).toBe('215/65 R15');
});
