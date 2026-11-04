import {
  emptyToNull,
  isUnusualChassis,
  normaliseChassis,
  normalisePlate,
  plateSearchKey,
} from '../validation';

test('plate allows letters, numbers, spaces and hyphens with no country format', () => {
  expect(normalisePlate('abc-1234')).toBe('ABC-1234');
  expect(normalisePlate('kh 44 20!')).toBe('KH 44 20');
});

test('chassis is uppercased without changing letters or digits', () => {
  expect(normaliseChassis('jt2bg22k0w0123456')).toBe('JT2BG22K0W0123456');
  expect(normaliseChassis('O0I1')).toBe('O0I1');
});

test('unusual chassis length warns but empty is fine', () => {
  expect(isUnusualChassis('')).toBe(false);
  expect(isUnusualChassis('ABCD')).toBe(true);
  expect(isUnusualChassis('ABCDE')).toBe(false);
  expect(isUnusualChassis('JT2BG22K0W0123456')).toBe(false);
  expect(isUnusualChassis('JT2BG22K0W01234567')).toBe(true);
});

test('plate search ignores case and hyphens', () => {
  expect(plateSearchKey('abc-1234')).toBe(plateSearchKey('ABC1234'));
});

test('empty fields are stored as null', () => {
  expect(emptyToNull('  ')).toBeNull();
  expect(emptyToNull(' ABC ')).toBe('ABC');
});
