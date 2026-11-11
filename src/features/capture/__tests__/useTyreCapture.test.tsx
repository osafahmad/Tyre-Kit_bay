import React from 'react';
import { act, render } from '@testing-library/react-native';
import * as VC from 'react-native-vision-camera';
import { useTyreCapture } from '../useTyreCapture';

// Drives the real hook's frame worklet with fake frames to check that the frame,
// its planes and every intermediate image are disposed on each path.

const mock = (VC as unknown as {
  __mock: { frameOutputOptions: { onFrame: (f: unknown) => void; pixelFormat: string } };
}).__mock;
const converter = VC.HybridFrameConverter as unknown as { convertFrameToImage: jest.Mock };

type Disposable = { dispose: jest.Mock };
const image = (width: number, height: number): Disposable & Record<string, unknown> => {
  const img: Disposable & Record<string, unknown> = {
    width,
    height,
    dispose: jest.fn(),
    rotate: jest.fn(() => image(height, width)),
    crop: jest.fn(() => image(100, 100)),
    saveToFileAsync: jest.fn(async () => {}),
  };
  return img;
};

function fakeFrame(lumaValue: number | ((x: number, y: number) => number)) {
  const W = 64;
  const H = 64;
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      data[y * W + x] = typeof lumaValue === 'number' ? lumaValue : lumaValue(x, y);
  const plane = { width: W, height: H, bytesPerRow: W, getPixelBuffer: () => data.buffer, dispose: jest.fn() };
  const uv = { ...plane, dispose: jest.fn() };
  return { orientation: 'left', isMirrored: false, width: 1920, height: 1080, getPlanes: () => [plane, uv], dispose: jest.fn(), plane, uv };
}

// Fine texture (pseudo-random), so it's sharp at any sampling step.
const sharp = (x: number, y: number) => 60 + ((x * 73 + y * 151 + ((x * y) % 7) * 37) % 170);

let hook: ReturnType<typeof useTyreCapture>;
function Harness({ stage, active }: { stage: 'sidewall' | 'tread'; active: boolean }) {
  hook = useTyreCapture({ stage, active });
  return null;
}

let now = 1_000_000;
beforeEach(() => {
  now += 10_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  converter.convertFrameToImage = jest.fn(() => image(720, 1280));
});
afterEach(() => jest.restoreAllMocks());

test('asks for YUV frames (the luminance plane is read directly)', async () => {
  await render(<Harness stage="tread" active />);
  expect(mock.frameOutputOptions.pixelFormat).toBe('yuv');
});

test('inactive: frames are disposed without being read', async () => {
  await render(<Harness stage="tread" active={false} />);
  const f = fakeFrame(120);
  mock.frameOutputOptions.onFrame(f);
  expect(f.dispose).toHaveBeenCalledTimes(1);
  expect(converter.convertFrameToImage).not.toHaveBeenCalled();
});

test('a dark frame is rejected; frame and planes are disposed, nothing converted', async () => {
  await render(<Harness stage="tread" active />);
  const f = fakeFrame(10);
  await act(async () => mock.frameOutputOptions.onFrame(f));
  expect(f.dispose).toHaveBeenCalledTimes(1);
  expect(f.plane.dispose).toHaveBeenCalled();
  expect(f.uv.dispose).toHaveBeenCalled();
  expect(converter.convertFrameToImage).not.toHaveBeenCalled();
  expect(hook.snapshot.status).toBe('too_dark');
});

test('an accepted tread frame: corrected upright in one redraw, saved at quality 90, every image disposed', async () => {
  await render(<Harness stage="tread" active />);
  const converted = image(1080, 1920);
  converter.convertFrameToImage = jest.fn(() => converted);
  const f = fakeFrame(sharp);
  await act(async () => {
    mock.frameOutputOptions.onFrame(f);
    await new Promise<void>(r => setImmediate(() => r()));
  });
  expect(f.dispose).toHaveBeenCalledTimes(1);
  // Same shared path as OCR: one redraw with the 180° correction for `left`, never ±90.
  expect((converted.rotate as jest.Mock).mock.calls).toEqual([[180, false]]);
  const upright = (
    (converted.rotate as jest.Mock).mock.results[0]?.value ?? converted
  ) as Disposable & { saveToFileAsync: jest.Mock };
  // No guide laid out in this harness: the whole upright frame is saved.
  expect(upright.saveToFileAsync).toHaveBeenCalledWith(expect.stringMatching(/capture-tmp\/.+\.jpg$/), 'jpg', 90);
  expect(upright.dispose).toHaveBeenCalled();
  if (upright !== converted) expect(converted.dispose).toHaveBeenCalled();
  expect(hook.snapshot.accepted).toBe(1);
});

test('with a guide: the saved image is the crop, and the full frame images are disposed', async () => {
  await render(<Harness stage="tread" active />);
  const converted = image(1080, 1920);
  converter.convertFrameToImage = jest.fn(() => converted);
  await act(async () => hook.setGuide({ x: 15, y: 60, width: 360, height: 300 }, { width: 390, height: 520 }));
  await act(async () => {
    mock.frameOutputOptions.onFrame(fakeFrame(sharp));
    await new Promise<void>(r => setImmediate(() => r()));
  });
  const upright = ((converted.rotate as jest.Mock).mock.results[0]?.value ?? converted) as Disposable & {
    crop: jest.Mock;
  };
  expect(upright.crop).toHaveBeenCalledTimes(1);
  const cropped = upright.crop.mock.results[0].value as Disposable & { saveToFileAsync: jest.Mock };
  expect(cropped.saveToFileAsync).toHaveBeenCalledWith(expect.any(String), 'jpg', 90);
  expect(cropped.dispose).toHaveBeenCalled();
  expect(upright.dispose).toHaveBeenCalled();
  expect(converted.dispose).toHaveBeenCalled();
});

test('a conversion error still disposes the frame and frees the pipeline', async () => {
  await render(<Harness stage="tread" active />);
  converter.convertFrameToImage = jest.fn(() => {
    throw new Error('convert failed');
  });
  const f = fakeFrame(sharp);
  await act(async () => mock.frameOutputOptions.onFrame(f));
  expect(f.dispose).toHaveBeenCalledTimes(1);

  // The next good frame is accepted, so `busy` was released.
  converter.convertFrameToImage = jest.fn(() => image(720, 1280));
  now += 1000;
  await act(async () => {
    mock.frameOutputOptions.onFrame(fakeFrame((x, y) => sharp(x + 7, y + 3)));
    await new Promise<void>(r => setImmediate(() => r()));
  });
  expect(converter.convertFrameToImage).toHaveBeenCalled();
});

test('sidewall: good frames are not taken until Capture is pressed', async () => {
  await render(<Harness stage="sidewall" active />);
  // Two identical frames: the second is steady.
  await act(async () => mock.frameOutputOptions.onFrame(fakeFrame(sharp)));
  expect(hook.snapshot.status).toBe('moving');
  now += 200;
  await act(async () => mock.frameOutputOptions.onFrame(fakeFrame(sharp)));
  expect(converter.convertFrameToImage).not.toHaveBeenCalled();
  expect(hook.snapshot.status).toBe('ok');
  await act(async () => hook.start());
  now += 200;
  await act(async () => {
    mock.frameOutputOptions.onFrame(fakeFrame(sharp));
    await new Promise<void>(r => setImmediate(() => r()));
  });
  expect(converter.convertFrameToImage).toHaveBeenCalledTimes(1);
});

test('expected frame drops are handled quietly, without a console warning per drop', async () => {
  const { frameDropCounts, resetFrameDropCounts } = jest.requireActual('../frameDrops') as typeof import('../frameDrops');
  resetFrameDropCounts();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await render(<Harness stage="tread" active />);
  const opts = mock.frameOutputOptions as unknown as { dropFramesWhileBusy: boolean; onFrameDropped?: (r: string) => void };
  expect(opts.dropFramesWhileBusy).toBe(true);
  expect(opts.onFrameDropped).toEqual(expect.any(Function));
  for (let i = 0; i < 20; i++) opts.onFrameDropped!('frame-was-late');
  expect(warn).not.toHaveBeenCalled();
  expect(frameDropCounts('tyre-capture')['frame-was-late']).toBe(20);
});

test('a run of passing frames reaches JS once; every rejected frame is still counted', async () => {
  await render(<Harness stage="sidewall" active />);
  const sample = jest.spyOn(hook.session, 'sample');
  for (let i = 0; i < 4; i++) {
    now += 200;
    await act(async () => mock.frameOutputOptions.onFrame(fakeFrame(sharp)));
  }
  // First frame has no previous one (moving), then steady: moving, ok — the other oks are skipped.
  expect(sample.mock.calls.map(c => c[0])).toEqual(['moving', 'ok']);
  expect(hook.snapshot.status).toBe('ok');
  for (let i = 0; i < 3; i++) {
    now += 200;
    await act(async () => mock.frameOutputOptions.onFrame(fakeFrame(10)));
  }
  expect(sample.mock.calls.map(c => c[0])).toEqual(['moving', 'ok', 'too_dark', 'too_dark', 'too_dark']);
  now += 200;
  await act(async () => mock.frameOutputOptions.onFrame(fakeFrame(sharp)));
  now += 200;
  await act(async () => mock.frameOutputOptions.onFrame(fakeFrame(sharp)));
  // After a rejection the next ok is sent again, so the status shown updates.
  expect(sample.mock.calls.slice(5).map(c => c[0])).toEqual(['moving', 'ok']);
  expect(hook.snapshot.status).toBe('ok');
});

test('a frame whose luminance read throws: planes and frame are still disposed', async () => {
  await render(<Harness stage="tread" active />);
  const f = fakeFrame(120);
  f.plane.getPixelBuffer = () => {
    throw new Error('buffer gone');
  };
  await act(async () => mock.frameOutputOptions.onFrame(f));
  expect(f.dispose).toHaveBeenCalledTimes(1);
  expect(f.plane.dispose).toHaveBeenCalled();
  expect(f.uv.dispose).toHaveBeenCalled();
});

test('every path disposes the frame exactly once (inactive, throttled, rejected, accepted)', async () => {
  await render(<Harness stage="tread" active />);
  const frames = [fakeFrame(sharp), fakeFrame(sharp), fakeFrame(10)];
  await act(async () => {
    mock.frameOutputOptions.onFrame(frames[0]); // accepted
    mock.frameOutputOptions.onFrame(frames[1]); // throttled (same timestamp)
    now += 200;
    mock.frameOutputOptions.onFrame(frames[2]); // rejected (dark)
    await new Promise<void>(r => setImmediate(() => r()));
  });
  for (const f of frames) expect(f.dispose).toHaveBeenCalledTimes(1);
});
