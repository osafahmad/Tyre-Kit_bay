import { captureStatusText } from '../statusText';

const at = (status: Parameters<typeof captureStatusText>[1]['status'], collecting = false) => ({
  status,
  collecting,
});

test('spec messages for the checks that run without the detector', () => {
  expect(captureStatusText('sidewall', at('starting')).label).toBe('Focusing…');
  expect(captureStatusText('sidewall', at('too_dark')).label).toBe('Too dark');
  expect(captureStatusText('sidewall', at('moving')).label).toBe('Hold steady');
  expect(captureStatusText('tread', at('blurry')).label).toBe('Hold steady');
});

test('never claims a distance it did not measure', () => {
  const all = (['starting', 'too_dark', 'too_bright', 'moving', 'blurry', 'repeat', 'ok'] as const).flatMap(
    s => [captureStatusText('sidewall', at(s)).label, captureStatusText('tread', at(s)).label],
  );
  expect(all).not.toContain('Distance OK');
  expect(all).not.toContain('Move closer');
  expect(all).not.toContain('Move back');
});

test('ready and capturing states', () => {
  expect(captureStatusText('sidewall', at('ok'))).toEqual({ label: 'Ready to capture', ok: true });
  expect(captureStatusText('sidewall', at('ok', true)).label).toBe('Hold steady');
  expect(captureStatusText('tread', at('ok'))).toEqual({ label: 'Image is clear', ok: true });
  expect(captureStatusText('tread', at('repeat')).label).toBe('Keep moving');
});
