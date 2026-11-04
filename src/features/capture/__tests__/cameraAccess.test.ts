import { cameraAccess } from '../cameraAccess';

test('granted and not yet asked', () => {
  expect(cameraAccess('authorized', 'ios', false)).toBe('granted');
  expect(cameraAccess('not-determined', 'android', false)).toBe('can_ask');
});

test('iOS denial is permanent: only Settings can fix it', () => {
  expect(cameraAccess('denied', 'ios', false)).toBe('blocked');
  expect(cameraAccess('restricted', 'ios', false)).toBe('blocked');
});

test('Android can ask once more, then treats a denial as permanent', () => {
  expect(cameraAccess('denied', 'android', false)).toBe('can_ask');
  expect(cameraAccess('denied', 'android', true)).toBe('blocked');
});
