import React from 'react';
import { act, render } from '@testing-library/react-native';
import * as VC from 'react-native-vision-camera';
import { useTextScanner, type ScanResult } from '../useTextScanner';
import { ocrConfig } from '../../../config/capture';

// Drives the real hook's frame worklet with fake frames. A Capture press must
// always end in onResult({ manual: true }), and every image must be disposed.

const mockOcr = { recognize: jest.fn() };
jest.mock('../../../ml/ocr/ocr', () => ({
  isOcrAvailable: () => true,
  recognizeLines: (path: string) => mockOcr.recognize(path),
}));

const mock = (VC as unknown as { __mock: { frameOutputOptions: { onFrame: (f: unknown) => void } } }).__mock;
const converter = VC.HybridFrameConverter as unknown as { convertFrameToImage: jest.Mock };

type FakeImage = Record<string, jest.Mock | number>;
function image(width: number, height: number): FakeImage {
  return {
    width,
    height,
    dispose: jest.fn(),
    rotate: jest.fn(() => image(width, height)),
    crop: jest.fn((x0: number, y0: number, x1: number, y1: number) => image(x1 - x0, y1 - y0)),
    saveToTemporaryFileAsync: jest.fn(async () => '/tmp/crop.jpg'),
  };
}
const frame = () => ({ width: 1920, height: 1080, orientation: 'left', isMirrored: false, dispose: jest.fn() });

const results: ScanResult[] = [];
let scanner: ReturnType<typeof useTextScanner>;
function Harness() {
  scanner = useTextScanner({ enabled: true, onResult: r => results.push(r) });
  return null;
}

const guide = { x: 65, y: 185, width: 260, height: 150 };
const view = { width: 390, height: 520 };
const flush = () => new Promise<void>(r => setImmediate(() => r()));

async function pressAndFeed(f: ReturnType<typeof frame>) {
  await act(async () => {
    scanner.captureOnce();
    mock.frameOutputOptions.onFrame(f);
    await flush();
  });
}

beforeEach(() => {
  results.length = 0;
  jest.useRealTimers();
  converter.convertFrameToImage = jest.fn(() => image(1080, 1920));
  mockOcr.recognize = jest.fn(async () => []);
});

test('saves the OCR crop at quality 90 (nitro-image 0–100 scale) and disposes everything', async () => {
  await render(<Harness />);
  const converted = image(1080, 1920);
  converter.convertFrameToImage = jest.fn(() => converted);
  await act(async () => scanner.setGuide(guide, view));
  const f = frame();
  await pressAndFeed(f);
  expect((converted.rotate as jest.Mock).mock.calls).toEqual([[180, false]]); // shared corrected path
  const baked = (converted.rotate as jest.Mock).mock.results[0].value as FakeImage;
  const crop = (baked.crop as jest.Mock).mock.results[0].value as FakeImage;
  expect(crop.saveToTemporaryFileAsync).toHaveBeenCalledWith('jpg', 90);
  expect(crop.dispose).toHaveBeenCalled();
  expect(baked.dispose).toHaveBeenCalled();
  expect((converted.dispose as jest.Mock)).toHaveBeenCalled();
  expect(f.dispose).toHaveBeenCalledTimes(1);
  // Nothing read: a normal empty result, not a failure.
  // Guide 720x415 px plus the 8 % OCR margin on each side.
  expect(results).toEqual([{ lines: [], crop: { width: 835, height: 482 }, manual: true }]);
});

test('native OCR error → failure "ocr" (kept apart from no text)', async () => {
  await render(<Harness />);
  mockOcr.recognize = jest.fn(async () => {
    throw Object.assign(new Error('Could not load image'), { code: 'ERR_IMAGE' });
  });
  await act(async () => scanner.setGuide(guide, view));
  await pressAndFeed(frame());
  expect(results).toEqual([expect.objectContaining({ manual: true, failure: 'ocr', lines: [] })]);
});

test('camera-thread error → failure "capture", not left pending', async () => {
  await render(<Harness />);
  converter.convertFrameToImage = jest.fn(() => {
    throw new Error('convert failed');
  });
  await act(async () => scanner.setGuide(guide, view));
  const f = frame();
  await pressAndFeed(f);
  expect(results).toEqual([expect.objectContaining({ manual: true, failure: 'capture' })]);
  expect(f.dispose).toHaveBeenCalledTimes(1);
});

test('null crop rect → failure "capture", and the full images are disposed', async () => {
  await render(<Harness />);
  const converted = image(1080, 1920);
  converter.convertFrameToImage = jest.fn(() => converted);
  await act(async () => scanner.setGuide(guide, { width: 0, height: 0 }));
  await pressAndFeed(frame());
  expect(results).toEqual([expect.objectContaining({ manual: true, failure: 'capture' })]);
  const baked = (converted.rotate as jest.Mock).mock.results[0].value as FakeImage;
  expect(baked.dispose).toHaveBeenCalled();
  expect(converted.dispose).toHaveBeenCalled();
});

test('guide not laid out yet → failure "capture"', async () => {
  await render(<Harness />);
  await pressAndFeed(frame());
  expect(results).toEqual([expect.objectContaining({ manual: true, failure: 'capture' })]);
});

test('live passes that fail are not reported as Capture results', async () => {
  await render(<Harness />);
  converter.convertFrameToImage = jest.fn(() => {
    throw new Error('convert failed');
  });
  await act(async () => scanner.setGuide(guide, view));
  await act(async () => {
    mock.frameOutputOptions.onFrame(frame());
    await flush();
  });
  expect(results.filter(r => r.manual)).toEqual([]);
});

test('no frame arrives → timeout answers the press with failure "capture", once', async () => {
  jest.useFakeTimers();
  await render(<Harness />);
  await act(async () => scanner.captureOnce());
  expect(results).toEqual([]);
  await act(async () => jest.advanceTimersByTime(ocrConfig.manualCaptureTimeoutMs));
  expect(results).toEqual([{ lines: [], crop: { width: 0, height: 0 }, manual: true, failure: 'capture' }]);
  await act(async () => jest.advanceTimersByTime(ocrConfig.manualCaptureTimeoutMs * 2));
  expect(results).toHaveLength(1);
});
