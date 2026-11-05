import { describeError, isControlCancellation } from '../cameraErrors';

describe('isControlCancellation', () => {
  it('treats the CameraX "Camera is not active" cancellation as non-fatal', () => {
    const e = new Error(
      'androidx.camera.core.CameraControl$OperationCanceledException: Camera is not active.',
    );
    expect(isControlCancellation(e)).toBe(true);
  });

  it('matches on the error name too', () => {
    const e = new Error('cancelled');
    e.name = 'OperationCanceledException';
    expect(isControlCancellation(e)).toBe(true);
  });

  it('keeps real session failures fatal', () => {
    expect(isControlCancellation(new Error('Failed to apply the stream configuration for the given outputs!'))).toBe(false);
    expect(isControlCancellation(new Error('Camera device is already in use!'))).toBe(false);
    expect(isControlCancellation(new Error('Encountered a fatal Camera error!'))).toBe(false);
  });
});

describe('describeError', () => {
  it('includes name, code and message', () => {
    const e = Object.assign(new Error('boom'), { code: 'device/fail' });
    expect(describeError(e)).toBe('Error (device/fail) boom');
  });

  it('handles non-Error values', () => {
    expect(describeError('oops')).toBe('oops');
  });
});
