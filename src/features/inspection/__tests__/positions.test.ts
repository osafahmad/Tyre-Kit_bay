import { orderedSelection, positionsFor, scanButtonLabel, tyreName } from '../positions';

test('scan order for 2, 4 and 6 tyres', () => {
  expect(positionsFor(2)).toEqual(['Front', 'Rear']);
  expect(positionsFor(4)).toEqual(['Left front', 'Right front', 'Left rear', 'Right rear']);
  expect(positionsFor(6)).toEqual([
    'Left front',
    'Right front',
    'Left rear outer',
    'Right rear outer',
    'Left rear inner',
    'Right rear inner',
  ]);
});

test('selection keeps scan order regardless of tap order', () => {
  expect(orderedSelection(4, new Set(['Right rear', 'Left front']))).toEqual([
    'Left front',
    'Right rear',
  ]);
});

test('scan button label', () => {
  expect(scanButtonLabel(1)).toBe('Scan 1 tyre');
  expect(scanButtonLabel(4)).toBe('Scan 4 tyres');
});

test('tyre name', () => {
  expect(tyreName('Left front')).toBe('Left front tyre');
});
