import { ReadStabilizer } from '../readStabilizer';
import { plateSearchKey } from '../../inspection/validation';

test('accepts a value once it has been read three times in the last five', () => {
  const s = new ReadStabilizer();
  expect(s.push('ABC')).toBeNull();
  expect(s.push(null)).toBeNull();
  expect(s.push('ABC')).toBeNull();
  expect(s.push('XYZ')).toBeNull();
  expect(s.push('ABC')).toBe('ABC');
});

test('older reads fall out of the window', () => {
  const s = new ReadStabilizer();
  s.push('ABC');
  s.push('ABC');
  s.push(null);
  s.push(null);
  s.push(null);
  expect(s.push('ABC')).toBeNull();
});

test('plates compare without spaces or hyphens and return the latest spelling', () => {
  const s = new ReadStabilizer(plateSearchKey);
  s.push('ABC 1234');
  s.push('ABC1234');
  expect(s.push('ABC-1234')).toBe('ABC-1234');
});

test('reset forgets earlier reads', () => {
  const s = new ReadStabilizer();
  s.push('ABC');
  s.push('ABC');
  s.reset();
  expect(s.push('ABC')).toBeNull();
});

test('progress is the share of matching reads needed, for the most-read value in the window', () => {
  const s = new ReadStabilizer(plateSearchKey);
  expect(s.progress()).toBe(0);
  s.push('ABC 1234');
  expect(s.progress()).toBeCloseTo(1 / 3);
  s.push(null);
  s.push('XYZ 9');
  expect(s.progress()).toBeCloseTo(1 / 3);
  s.push('ABC-1234');
  expect(s.progress()).toBeCloseTo(2 / 3);
  // The first read leaves the 5-read window: progress falls back.
  s.push(null);
  s.push(null);
  expect(s.progress()).toBeCloseTo(1 / 3);
  s.reset();
  expect(s.progress()).toBe(0);
});
