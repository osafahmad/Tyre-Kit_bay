import { frameDropCounts, frameDropHandler, recordFrameDrop, resetFrameDropCounts } from '../frameDrops';

beforeEach(() => resetFrameDropCounts());
afterEach(() => jest.restoreAllMocks());

test('late frames (expected with dropFramesWhileBusy) are counted per output, never logged', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  for (let i = 0; i < 50; i++) recordFrameDrop('tyre-capture', 'frame-was-late', true);
  recordFrameDrop('text-scanner', 'frame-was-late', true);
  expect(warn).not.toHaveBeenCalled();
  expect(frameDropCounts('tyre-capture')['frame-was-late']).toBe(50);
  expect(frameDropCounts('text-scanner')['frame-was-late']).toBe(1);
});

test('out of buffers warns once per output in development, naming the output', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  recordFrameDrop('tyre-capture', 'out-of-buffers', true);
  recordFrameDrop('tyre-capture', 'out-of-buffers', true);
  recordFrameDrop('text-scanner', 'out-of-buffers', true);
  expect(warn).toHaveBeenCalledTimes(2);
  expect(warn.mock.calls[0][0]).toContain('tyre-capture');
  expect(warn.mock.calls[1][0]).toContain('text-scanner');
  expect(frameDropCounts('tyre-capture')['out-of-buffers']).toBe(2);
});

test('release builds never log', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  recordFrameDrop('tyre-capture', 'out-of-buffers', false);
  recordFrameDrop('text-scanner', 'unknown', false);
  expect(warn).not.toHaveBeenCalled();
});

test('frameDropHandler records under its own output', () => {
  frameDropHandler('text-scanner')('discontinuity');
  expect(frameDropCounts('text-scanner').discontinuity).toBe(1);
  expect(frameDropCounts('tyre-capture').discontinuity).toBe(0);
});
