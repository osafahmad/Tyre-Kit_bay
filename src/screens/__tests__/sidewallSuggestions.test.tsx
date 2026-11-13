import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SidewallCapturedScreen } from '../SidewallCaptured/SidewallCapturedScreen';
import { useInspectionStore } from '../../features/inspection/store';
import type { SidewallReadOutcome } from '../../ml/sidewallReader';

// The reader is mocked; its whole-frame OCR → filter logic is tested in src/ml/__tests__/sidewallReader.test.ts.
const mockReader = {
  canRead: jest.fn((_frames: string[]) => true),
  read: jest.fn(),
};
jest.mock('../../ml/sidewallReader', () => ({
  ...jest.requireActual('../../ml/sidewallReader'),
  getSidewallReader: () => mockReader,
}));
// The staging detector card (Stage 1, 2026-11-13) runs the text detector on open; its
// service is tested in src/ml/services/__tests__/SidewallTextDetector.test.ts.
const mockDetectFrame = jest.fn<Promise<unknown>, [string, number]>(async () => ({
  status: 'unavailable',
  reason: 'model_missing',
  detail: 'test',
}));
// The staging detector card (Stage 1–2) would also run the detector on open; it is off here so the
// empty-capture check's calls can be counted. The card is tested through its own service tests.
jest.mock('../../config/diagnostics', () => {
  const real = jest.requireActual('../../config/diagnostics');
  return { diagnosticsConfig: { ...real.diagnosticsConfig, sidewallDetectorDebugCard: false } };
});
jest.mock('../../ml/services/SidewallTextDetector', () => ({
  getSidewallTextDetector: () => ({
    detectFrame: (f: string, i: number) => mockDetectFrame(f, i),
    readCrops: jest.fn(async () => ({ status: 'unavailable', reason: 'no_detections' })),
  }),
  deleteCropFiles: jest.fn(async () => {}),
}));

/** Lets the screen's read promise chain settle inside act(). */
const flush = () => act(async () => new Promise<void>(r => setTimeout(r, 0)));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

function seedTyre(details = { size: null, dotTin: null, make: null, model: null } as Record<string, string | null>) {
  const store = useInspectionStore.getState();
  store.replaceAll([], null);
  store.startInspection('test');
  store.selectTyres(['FL']);
  const s = useInspectionStore.getState();
  const tyreId = s.inspections.find(i => i.id === s.currentId)!.tyres[0].id;
  store.setSidewallCaptured(tyreId, ['frames/a.jpg', 'frames/b.jpg'], details as never);
  return tyreId;
}

const details = (tyreId: string) => {
  const s = useInspectionStore.getState();
  return s.inspections.flatMap(i => i.tyres).find(t => t.id === tyreId)!.sidewallDetails;
};

function renderScreen(tyreId: string) {
  const navigation = { navigate: jest.fn(), replace: jest.fn() };
  return render(
    <SidewallCapturedScreen
      navigation={navigation as never}
      route={{ key: 'k', name: 'SidewallCaptured', params: { tyreId } } as never}
    />,
  );
}

const done = (suggestions: Record<string, string>, linesRead = 3): SidewallReadOutcome => ({
  status: 'done',
  suggestions,
  ocrRuns: 2,
  linesRead,
});

beforeEach(() => {
  mockReader.canRead.mockReset().mockReturnValue(true);
  mockReader.read.mockReset();
});

test('read values fill the fields as suggestions and are saved; the user can still edit them', async () => {
  const tyreId = seedTyre();
  const read = deferred<SidewallReadOutcome>();
  mockReader.read.mockReturnValue(read.promise);
  await renderScreen(tyreId);

  expect(mockReader.read).toHaveBeenCalledWith(['frames/a.jpg', 'frames/b.jpg'], expect.any(Function));
  expect(screen.getByLabelText('Tyre size').props.placeholder).toBe('Reading…');

  await act(async () => read.resolve(done({ size: '205/55 R16', dotTin: '4B7Y 2319', make: 'MICHELIN' })));
  expect(screen.getByLabelText('Tyre size').props.value).toBe('205/55 R16');
  expect(screen.getByLabelText('Make').props.value).toBe('MICHELIN');
  expect(screen.getByLabelText('Model').props.value).toBe('');
  expect(screen.getByLabelText('Model').props.placeholder).toBe('Not read');
  expect(details(tyreId)).toEqual({ size: '205/55 R16', dotTin: '4B7Y 2319', make: 'MICHELIN', model: null });

  await fireEvent.changeText(screen.getByLabelText('Make'), 'Michelin');
  expect(details(tyreId).make).toBe('Michelin');
});

test('fields the user typed in while reading are not overwritten', async () => {
  const tyreId = seedTyre();
  const read = deferred<SidewallReadOutcome>();
  mockReader.read.mockReturnValue(read.promise);
  await renderScreen(tyreId);

  await fireEvent.changeText(screen.getByLabelText('Tyre size'), '195/65r15');
  expect(screen.getByLabelText('Tyre size').props.placeholder).toBe('Not read');
  await act(async () => read.resolve(done({ size: '205/55 R16', model: 'Primacy 4' })));

  expect(screen.getByLabelText('Tyre size').props.value).toBe('195/65R15');
  expect(screen.getByLabelText('Model').props.value).toBe('Primacy 4');
});

test('values already confirmed are kept; only empty fields are filled', async () => {
  const tyreId = seedTyre({ size: '195/65 R15', dotTin: null, make: 'Pirelli', model: null });
  mockReader.read.mockResolvedValue(done({ size: '205/55 R16', make: 'MICHELIN', dotTin: '2319' }));
  await renderScreen(tyreId);
  await flush();
  expect(screen.getByLabelText('Tyre size').props.value).toBe('195/65 R15');
  expect(screen.getByLabelText('Make').props.value).toBe('Pirelli');
  expect(screen.getByLabelText('DOT/TIN').props.value).toBe('2319');
});

test('nothing read, reader unavailable or failing: fields stay empty and show Not read', async () => {
  for (const outcome of [
    () => Promise.resolve(done({})),
    () => Promise.resolve({ status: 'unavailable', reason: 'no_frames' } as SidewallReadOutcome),
    () => Promise.reject(new Error('boom')),
  ]) {
    const tyreId = seedTyre();
    mockReader.read.mockImplementation(outcome);
    const view = await renderScreen(tyreId);
    await flush();
    for (const label of ['Tyre size', 'DOT/TIN', 'Make', 'Model']) {
      expect(screen.getByLabelText(label).props.value).toBe('');
      expect(screen.getByLabelText(label).props.placeholder).toBe('Not read');
    }
    await view.unmount();
  }
});

test('no reading when it is not possible (no OCR / demo frames) or all fields are filled', async () => {
  mockReader.canRead.mockReturnValue(false);
  const view = await renderScreen(seedTyre());
  expect(mockReader.read).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Make').props.placeholder).toBe('Not read');
  await view.unmount();

  mockReader.canRead.mockReturnValue(true);
  await renderScreen(seedTyre({ size: 'a', dotTin: 'b', make: 'c', model: 'd' }));
  expect(mockReader.read).not.toHaveBeenCalled();
});

test('leaving the screen cancels the read', async () => {
  const tyreId = seedTyre();
  const read = deferred<SidewallReadOutcome>();
  mockReader.read.mockReturnValue(read.promise);
  const view = await renderScreen(tyreId);
  const isCancelled = mockReader.read.mock.calls[0][1] as () => boolean;
  expect(isCancelled()).toBe(false);
  await view.unmount();
  expect(isCancelled()).toBe(true);
  await act(async () => read.resolve(done({ size: '205/55 R16' })));
  expect(details(tyreId).size).toBeNull();
});

test('a rescan that only reads size and DOT keeps make and model from the earlier scan', async () => {
  // First scan: make and model were read and saved.
  const tyreId = seedTyre();
  mockReader.read.mockResolvedValue(done({ make: 'Continental', model: 'ComfortContact' }));
  const first = await renderScreen(tyreId);
  await flush();
  expect(details(tyreId)).toMatchObject({ make: 'Continental', model: 'ComfortContact', size: null });
  await first.unmount();

  // Rescan (new frames, details carried over as useStageOutcome does): only size and DOT read.
  await act(async () =>
    useInspectionStore.getState().setSidewallCaptured(tyreId, ['frames/c.jpg'], details(tyreId)),
  );
  mockReader.read.mockResolvedValue(done({ size: '195/55 R15', dotTin: '0124', make: 'Contnental' }));
  await renderScreen(tyreId);
  await flush();
  expect(details(tyreId)).toEqual({
    size: '195/55 R15',
    dotTin: '0124',
    make: 'Continental', // not replaced by the later read
    model: 'ComfortContact',
  });
});

describe('empty sidewall capture notice (owner request 2026-11-13)', () => {
  const NOTICE = "No tyre sidewall detected — point closely at the tyre's sidewall lettering and retake";
  const doneResult = (n: number) => ({
    status: 'done',
    result: { detections: Array.from({ length: n }, () => ({ label: 'Size' })) },
  });

  beforeEach(() => mockDetectFrame.mockReset());

  test('OCR read no line and the detector found no box in any frame: the notice is shown', async () => {
    mockDetectFrame.mockImplementation(async () => doneResult(0));
    const tyreId = seedTyre();
    mockReader.read.mockResolvedValue(done({}, 0));
    await renderScreen(tyreId);
    await flush();
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(mockDetectFrame).toHaveBeenCalledTimes(2); // both frames
    expect(screen.getByLabelText('Tyre size').props.placeholder).toBe('Not read');
  });

  test('OCR read no line but the detector found a box: no notice (the text is there, just unread)', async () => {
    mockDetectFrame.mockImplementation(async () => doneResult(1));
    const tyreId = seedTyre();
    mockReader.read.mockResolvedValue(done({}, 0));
    await renderScreen(tyreId);
    await flush();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  test('OCR read lines (even unusable ones): the detector is not asked and no notice is shown', async () => {
    const tyreId = seedTyre();
    mockReader.read.mockResolvedValue(done({}, 4));
    await renderScreen(tyreId);
    await flush();
    expect(mockDetectFrame).not.toHaveBeenCalled();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  test('the model is missing: the empty OCR alone shows the notice', async () => {
    mockDetectFrame.mockImplementation(async () => ({ status: 'unavailable', reason: 'model_missing', detail: 'x' }));
    const tyreId = seedTyre();
    mockReader.read.mockResolvedValue(done({}, 0));
    await renderScreen(tyreId);
    await flush();
    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(mockDetectFrame).toHaveBeenCalledTimes(1); // stops at the first missing-model answer
  });
});
