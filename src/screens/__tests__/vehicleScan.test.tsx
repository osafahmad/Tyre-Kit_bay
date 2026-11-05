import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as VC from 'react-native-vision-camera';
import App from '../../app/App';
import { useInspectionStore } from '../../features/inspection/store';
import { settings } from '../../features/inspection/settings';
import { MemoryInspectionRepository } from '../../features/inspection/repository';
import { resetCameraAccessSession } from '../../features/capture/useCameraAccess';
import type { ScanResult } from '../../features/capture/useTextScanner';

// Replace the camera pipeline with a hand-driven one: tests feed OCR results.
const mockScanner = {
  onResult: null as ((r: ScanResult) => void) | null,
  available: true,
  captureOnce: jest.fn(),
};
jest.mock('../../features/capture/useTextScanner', () => ({
  useTextScanner: ({ onResult }: { onResult: (r: ScanResult) => void }) => {
    mockScanner.onResult = onResult;
    return {
      frameOutput: {},
      state: mockScanner.available ? 'scanning' : 'unavailable',
      available: mockScanner.available,
      setGuide: () => {},
      captureOnce: mockScanner.captureOnce,
    };
  },
}));

const camera = (VC as unknown as { __mock: { status: string; answer: string; device: unknown } }).__mock;

const lines = (text: string, height = 40) => [
  { text, frame: { x: 0, y: 0, width: 200, height }, elements: [] },
];
const read = async (
  text: string | null,
  opts: { manual?: boolean; height?: number; failure?: 'ocr' | 'capture' } = {},
) =>
  act(async () =>
    mockScanner.onResult!({
      lines: text ? lines(text, opts.height) : [],
      crop: { width: 400, height: 100 },
      manual: opts.manual ?? false,
      failure: opts.failure,
    }),
  );

const press = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));

beforeEach(() => {
  useInspectionStore.getState().replaceAll([], null);
  settings.setHasSeenWalkthrough(true);
  settings.setCurrentInspectionId(null);
  resetCameraAccessSession();
  camera.status = 'authorized';
  camera.answer = 'authorized';
  camera.device = { position: 'back', hasTorch: true, hasFlash: true };
  mockScanner.available = true;
  mockScanner.captureOnce.mockClear();
});

async function startScan() {
  await render(<App repository={new MemoryInspectionRepository()} />);
  await press('Start scan');
}

describe('camera permission', () => {
  test('first scan shows Camera access, asks the system, then opens the plate scan', async () => {
    camera.status = 'not-determined';
    await startScan();
    expect(await screen.findByText('Allow camera access')).toBeTruthy();
    await press('Allow camera');
    expect(VC.VisionCamera.requestCameraPermission).toHaveBeenCalled();
    expect(await screen.findByText('Scan number plate')).toBeTruthy();
    expect(screen.getByTestId('camera-preview')).toBeTruthy();
  });

  test('already allowed: the scan opens directly', async () => {
    await startScan();
    expect(await screen.findByText('Scan number plate')).toBeTruthy();
    expect(screen.queryByText('Allow camera access')).toBeNull();
  });

  test('permanently denied: Camera access is off, Open Settings, and typing still works', async () => {
    camera.status = 'not-determined';
    camera.answer = 'denied';
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await startScan();
    await press('Allow camera');
    // Jest runs as iOS, where a denial can't be asked again.
    expect(await screen.findByText('Camera access is off')).toBeTruthy();
    expect(screen.getByText('Turn it on in Settings to scan tyres.')).toBeTruthy();
    expect(screen.queryByTestId('camera-preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'Capture plate' })).toBeDisabled();
    await press('Open Settings');
    expect(openSettings).toHaveBeenCalled();

    await press('Type it');
    expect(await screen.findByText('Check vehicle details')).toBeTruthy();
  });

  test('Not now still lets the user skip both scans', async () => {
    camera.status = 'not-determined';
    await startScan();
    await press('Not now');
    expect(await screen.findByText('Scan number plate')).toBeTruthy();
    await press('Skip');
    expect(await screen.findByText('Scan chassis number')).toBeTruthy();
    await press('Skip');
    expect(await screen.findByText('Select tyres to scan')).toBeTruthy();
  });

  test('first-launch Camera access asks the system, then goes Home', async () => {
    settings.setHasSeenWalkthrough(false);
    camera.status = 'not-determined';
    await render(<App repository={new MemoryInspectionRepository()} />);
    await press('Get started');
    await press('Skip');
    await press('Allow camera');
    expect(VC.VisionCamera.requestCameraPermission).toHaveBeenCalled();
    expect(await screen.findByText('Ready to inspect')).toBeTruthy();
  });

  test('no back camera: says so and typing still works', async () => {
    camera.device = undefined;
    await startScan();
    expect(await screen.findByText('No camera found')).toBeTruthy();
    await press('Type it');
    expect(await screen.findByText('Check vehicle details')).toBeTruthy();
  });
});

describe('plate scanning', () => {
  test('the same plate read three times opens Confirm plate with exactly what was read', async () => {
    await startScan();
    await screen.findByText('Scan number plate');
    await read('ABC 1234');
    await read(null);
    await read('ABC1234');
    expect(screen.queryByText('Plate found')).toBeNull();
    await read('ABC-1234');
    expect(await screen.findByText('Plate found')).toBeTruthy();
    expect(screen.getByLabelText('Plate ABC-1234')).toBeTruthy();
  });

  test('Capture with nothing readable explains and stays on the scan', async () => {
    await startScan();
    await press('Capture plate');
    expect(mockScanner.captureOnce).toHaveBeenCalled();
    await read(null, { manual: true });
    expect(screen.getByText("Couldn't read the plate. Try again, or type it.")).toBeTruthy();
    expect(screen.getByText('Scan number plate')).toBeTruthy();
  });

  test('Capture with a readable plate goes straight to Confirm plate', async () => {
    await startScan();
    await press('Capture plate');
    await read('LEB 7781', { manual: true });
    expect(await screen.findByText('Plate found')).toBeTruthy();
  });

  test('a value that is not plate-shaped is never shown as Plate found (device misread)', async () => {
    await startScan();
    await press('Capture plate');
    await read('PTIUI4t', { manual: true });
    expect(screen.getByText("Couldn't read the plate. Try again, or type it.")).toBeTruthy();
    expect(screen.queryByText('Plate found')).toBeNull();
    // Live reads of it never become stable either.
    await read('PTIUI4t');
    await read('PTIUI4t');
    await read('PTIUI4t');
    expect(screen.queryByText('Plate found')).toBeNull();
  });

  test('Capture: a native OCR error and a camera image problem each have their own message', async () => {
    await startScan();
    await press('Capture plate');
    await read(null, { manual: true, failure: 'ocr' });
    expect(screen.getByText('Text reading failed. Try again, or type it.')).toBeTruthy();
    await press('Capture plate');
    await read(null, { manual: true, failure: 'capture' });
    expect(screen.getByText("Couldn't get an image from the camera. Try again, or type it.")).toBeTruthy();
    expect(screen.queryByText("Couldn't read the plate. Try again, or type it.")).toBeNull();
  });

  test('OCR unavailable: the screen says so and Type it still works', async () => {
    mockScanner.available = false;
    await startScan();
    expect(await screen.findByText("Text reading isn't available. Type it instead.")).toBeTruthy();
    await press('Capture plate');
    expect(mockScanner.captureOnce).not.toHaveBeenCalled();
    await press('Type it');
    expect(await screen.findByText('Check vehicle details')).toBeTruthy();
  });

  test('a misread plate can be corrected with Edit', async () => {
    await startScan();
    await press('Capture plate');
    await read('A8C 1234', { manual: true });
    await press('Edit plate');
    const field = await screen.findByLabelText('Number plate, optional');
    expect(field.props.value).toBe('A8C 1234');
    await fireEvent.changeText(field, 'abc 1234');
    await press('Continue');
    const s = useInspectionStore.getState();
    expect(s.inspections.find(i => i.id === s.currentId)?.plate).toBe('ABC 1234');
  });
});

describe('chassis scanning', () => {
  async function toChassis() {
    await startScan();
    await press('Skip');
    await screen.findByText('Scan chassis number');
  }

  test('Capture failures show the OCR error or camera message, not "couldn\'t read"', async () => {
    await toChassis();
    await press(/Capture/);
    await read(null, { manual: true, failure: 'ocr' });
    expect(screen.getByText('Text reading failed. Try again, or type it.')).toBeTruthy();
    await press(/Capture/);
    await read(null, { manual: true, failure: 'capture' });
    expect(screen.getByText("Couldn't get an image from the camera. Try again, or type it.")).toBeTruthy();
  });

  test('a stable read opens Vehicle details with it filled in, not padded to 17', async () => {
    await toChassis();
    await read('KE30123456');
    await read('KE30123456');
    await read('KE30123456');
    expect(await screen.findByText('Check vehicle details')).toBeTruthy();
    expect(screen.getByLabelText('Chassis number, optional').props.value).toBe('KE30123456');
    expect(screen.getByLabelText('Number plate, optional').props.value).toBe('');
  });

  test('small text shows Move closer and nothing is accepted', async () => {
    await toChassis();
    await read('JT2BG22K0W0123456', { height: 8 });
    expect(screen.getByText('Move closer')).toBeTruthy();
    await read('JT2BG22K0W0123456', { height: 8 });
    await read('JT2BG22K0W0123456', { height: 8 });
    expect(screen.getByText('Scan chassis number')).toBeTruthy();
  });

  test('Skip goes to Select tyres with no chassis saved', async () => {
    await toChassis();
    await press('Skip');
    expect(await screen.findByText('Select tyres to scan')).toBeTruthy();
    const s = useInspectionStore.getState();
    expect(s.inspections.find(i => i.id === s.currentId)?.chassis).toBeNull();
  });
});
