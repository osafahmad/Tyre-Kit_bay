import { cropPassCoveredAllFrames, readSidewallCrops, type CropPassDetector } from '../sidewallCropPass';
import type { SidewallTextFrameResult } from '../SidewallTextDetector';

const frameResult = (frame: string, detections: number) =>
  ({ frame, detections: Array.from({ length: detections }, () => ({ label: 'Size' })) }) as unknown as SidewallTextFrameResult;

function detector(byFrame: Record<string, number | 'missing'>): CropPassDetector & { detectFrame: jest.Mock; readCrops: jest.Mock } {
  return {
    detectFrame: jest.fn(async (frame: string) => {
      const n = byFrame[frame];
      return n === 'missing'
        ? { status: 'unavailable', reason: 'model_missing', detail: 'x' }
        : { status: 'done', result: frameResult(frame, n ?? 0) };
    }),
    readCrops: jest.fn(async (r: SidewallTextFrameResult) => ({
      status: 'done',
      crops: r.detections.map((_, i) => ({ detection: i, thumbnailPath: `/tmp/${r.frame}_${i}.jpg`, ignored: null })),
    })),
  } as never;
}

test('runs on at most maxFrames frames spread over the scan, skips simulated frames, deletes thumbnails', async () => {
  const frames = ['a', 'b', 'c', 'd', 'e', 'demo://x'];
  const d = detector({ a: 2, b: 0, c: 1, d: 0, e: 3 });
  const deleteFile = jest.fn(async () => {});
  const pass = await readSidewallCrops(frames, d, { deleteFile, maxFrames: 3 });
  expect(d.detectFrame.mock.calls.map(c => c[0])).toEqual(['a', 'c', 'e']);
  expect(d.readCrops).toHaveBeenCalledTimes(3);
  expect(pass).toMatchObject({ framesRun: 3, detections: 6, realFrames: 5, modelMissing: false });
  expect(pass.frames.map(f => f.length)).toEqual([2, 1, 3]);
  expect(deleteFile).toHaveBeenCalledTimes(6);
  expect(cropPassCoveredAllFrames(pass)).toBe(false);
});

test('a frame with no boxes is not cropped; covering every frame lets its count stand in for a full sweep', async () => {
  const d = detector({ a: 0, b: 0 });
  const pass = await readSidewallCrops(['a', 'b'], d, { deleteFile: async () => {} });
  expect(d.readCrops).not.toHaveBeenCalled();
  expect(pass).toMatchObject({ framesRun: 2, detections: 0, frames: [] });
  expect(cropPassCoveredAllFrames(pass)).toBe(true);
});

test('stops at a missing model and when cancelled; never throws', async () => {
  const missing = detector({ a: 'missing', b: 1 });
  const pass = await readSidewallCrops(['a', 'b'], missing, { deleteFile: async () => {} });
  expect(missing.detectFrame).toHaveBeenCalledTimes(1);
  expect(pass.modelMissing).toBe(true);
  expect(cropPassCoveredAllFrames(pass)).toBe(true);

  const d = detector({ a: 1, b: 1 });
  expect((await readSidewallCrops(['a', 'b'], d, { deleteFile: async () => {}, isCancelled: () => true })).framesRun).toBe(0);

  const throwing = detector({});
  throwing.detectFrame.mockRejectedValue(new Error('boom'));
  await expect(readSidewallCrops(['a'], throwing, { deleteFile: async () => {} })).resolves.toMatchObject({ framesRun: 0 });
});
