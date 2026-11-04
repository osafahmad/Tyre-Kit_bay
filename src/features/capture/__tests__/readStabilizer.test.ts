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
