import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { cropText, readoutText } from '../SidewallDetectorDebugCard';
import type { SidewallCropResult, SidewallTextDetectOutcome } from '../../ml/services/SidewallTextDetector';

const mockFlags = { enableStagingLogs: true, sidewallDetectorDebugCard: true };
jest.mock('../../config/diagnostics', () => {
  const real = jest.requireActual('../../config/diagnostics');
  return {
    diagnosticsConfig: new Proxy(real.diagnosticsConfig, {
      get: (target, key: string) => (key in mockFlags ? mockFlags[key as keyof typeof mockFlags] : target[key]),
    }),
  };
});
jest.mock('../../ml/services/SidewallTextDetector', () => ({
  getSidewallTextDetector: () => ({
    detectFrame: async () => ({ status: 'unavailable', reason: 'model_missing', detail: 'test' }),
    readCrops: async () => ({ status: 'unavailable', reason: 'no_detections' }),
  }),
  deleteCropFiles: jest.fn(async () => {}),
}));

import { DeveloperDebugSection } from '../DeveloperDebugSection';
import { setDebugLogBuffer } from '../../utils/debugLogBuffer';

afterEach(() => {
  setDebugLogBuffer(false);
  mockFlags.enableStagingLogs = true;
  mockFlags.sidewallDetectorDebugCard = true;
});

test('renders nothing when both staging flags are off (store build)', async () => {
  mockFlags.enableStagingLogs = false;
  mockFlags.sidewallDetectorDebugCard = false;
  setDebugLogBuffer(true);
  await render(<DeveloperDebugSection frames={['frames/a.jpg']} />);
  expect(screen.queryByTestId('developer-debug')).toBeNull();
  expect(screen.queryByText('Developer debug')).toBeNull();
});

test('with only staging logs on, opening shows Copy logs and no detector card', async () => {
  mockFlags.sidewallDetectorDebugCard = false;
  setDebugLogBuffer(true);
  await render(<DeveloperDebugSection frames={['frames/a.jpg']} />);
  expect(screen.queryByText('Copy logs')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Developer debug' }));
  expect(screen.getByText('Copy logs')).toBeTruthy();
  expect(screen.queryByTestId('sidewall-detector-card')).toBeNull();
});

test('readout lists timings, tensor shapes, class scores and each box', () => {
  const outcome = {
    status: 'done',
    result: {
      frame: 'frames/a.jpg',
      source: { width: 1080, height: 1120 },
      letterbox: { scale: 0.5714, padX: 11, padY: 0 },
      detections: [
        { label: 'Size', score: 0.9123, frameRect: { x: 100.4, y: 200.6, width: 300, height: 40 } },
        { label: 'DOT', score: 0.5, frameRect: null },
      ],
      timings: { decodeMs: 12, inferenceMs: 34, postMs: 5 },
      stats: { anchors: 8400, boxes: { min: 0, max: 640 }, classMax: { Brand: 0.1, Size: 0.912 }, anchorsAboveThreshold: 7 },
      boxFormat: { used: 'cxcywh_pixels', manifest: 'cxcywh_pixels', inferred: 'cxcywh_pixels', overridden: false },
      thresholds: { confidence: 0.25, iou: 0.45, maxDetections: 300 },
      tensors: {
        inputs: [{ name: 'in', shape: [1, 3, 640, 640], dataType: 'float32' }],
        outputs: [{ name: 'out', shape: [1, 8, 8400], dataType: 'float32' }],
      },
      delegate: 'cpu',
      modelVersion: 'test-model',
      loadMs: 80,
    },
  } as unknown as SidewallTextDetectOutcome;
  const text = readoutText(outcome);
  expect(text).toContain('model test-model');
  expect(text).toContain('delegate cpu, load 80 ms');
  expect(text).toContain('decode 12 ms · infer 34 ms · post 5 ms');
  expect(text).toContain('out [1,8,8400] float32');
  expect(text).toContain('boxes raw 0 … 640 → cxcywh_pixels');
  expect(text).toContain('class max Brand 0.1, Size 0.912');
  expect(text).toContain('conf ≥ 0.25: 7 of 8400 anchors · IoU 0.45');
  expect(text).toContain('  Size 0.912 @ 100,201 300×40');
  expect(text).toContain('  DOT 0.500 (in padding)');
  expect(text).not.toMatch(/mask|proto/);
  expect(readoutText(null)).toBe('Running…');
  expect(readoutText({ status: 'failed', error: 'boom' })).toBe('Failed\nboom');
});

test('crop text shows the box, the kept orientation and every raw read', () => {
  const crop = {
    detection: 0,
    label: 'Size',
    score: 0.91,
    crop: { x1: 10, y1: 20, x2: 310, y2: 60 },
    thumbnailPath: null,
    reads: [
      { rotation: 0, text: '195/55 R15', reading: { size: '195/55 R15' } },
      { rotation: 180, text: '', reading: {} },
    ],
    best: { rotation: 0, text: '195/55 R15', reading: { size: '195/55 R15' } },
    ocrMs: 42,
    verified: true,
    ignored: null,
    overlappedBy: null,
  } as unknown as SidewallCropResult;
  expect(cropText(crop)).toBe(
    ['Size 0.91 · crop 300×40 @ 10,20 · OCR 42 ms', '  best 0° → size 195/55 R15', '  0°      195/55 R15', '  180°    (no text)'].join('\n'),
  );
});
