import { frameDropCounts, onFrameDropped, resetFrameDropCounts } from '../frameDrops';

beforeEach(() => resetFrameDropCounts());
afterEach(() => jest.restoreAllMocks());

test('late frames (expected with dropFramesWhileBusy) are counted, never logged', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  for (let i = 0; i < 50; i++) onFrameDropped('frame-was-late', true);
  expect(warn).not.toHaveBeenCalled();
  expect(frameDropCounts()['frame-was-late']).toBe(50);
});

test('out of buffers (frames not disposed) warns once in development', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  onFrameDropped('out-of-buffers', true);
  onFrameDropped('out-of-buffers', true);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(frameDropCounts()['out-of-buffers']).toBe(2);
});

test('release builds never log', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  onFrameDropped('out-of-buffers', false);
  onFrameDropped('unknown', false);
  expect(warn).not.toHaveBeenCalled();
});
