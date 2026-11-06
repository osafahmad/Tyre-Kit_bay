import { exists } from '@dr.pogodin/react-native-fs';
import {
  analysedTyres,
  nextTyre,
  pendingTyres,
  scannedTyres,
  useInspectionStore,
} from '../store';
import { startPersistence } from '../persistence';
import { MemoryInspectionRepository } from '../repository';
import { settings } from '../settings';
import { resumeRoutes } from '../resume';
import { reconcileFrames } from '../../capture/frameFiles';
import { reportSummary } from '../../report/summary';
import { positionsFor } from '../positions';
import type { Inspection, TyreResult } from '../types';

const store = () => useInspectionStore.getState();
const current = (): Inspection => store().inspections.find(i => i.id === store().currentId)!;

const sidewall = Array.from({ length: 8 }, (_, i) => `demo://sidewall/${i}`);
const tread = Array.from({ length: 10 }, (_, i) => `demo://tread/${i}`);

const goodResult: TyreResult = {
  status: 'good',
  treadDepthMm: null,
  treadConfidence: null,
  wearPattern: null,
  damageFound: null,
  damageConfidence: null,
  size: null,
  rimInches: null,
  make: null,
  model: null,
  dotTin: null,
  ageYears: null,
  ageMonths: null,
};

/** Capture both stages for the next tyre, as the screens do. */
function captureNext(): string {
  const tyre = nextTyre(current())!;
  store().updateTyre(tyre.id, { state: 'capturing_sidewall' });
  store().setSidewallCaptured(tyre.id, sidewall, {
    size: '215/65 R15',
    dotTin: null,
    make: null,
    model: null,
  });
  store().setTreadCaptured(tyre.id, tread);
  return tyre.id;
}

beforeEach(() => {
  store().replaceAll([], null);
  settings.setCurrentInspectionId(null);
});

test('four tyres in scan order; pending tyres keep their frames and the flow moves on', () => {
  store().startInspection('tflite-unconfigured');
  store().setVehicle({ plate: 'ABC-1234', chassis: null });
  store().selectTyres(positionsFor(4));
  expect(current().tyres.map(t => t.position)).toEqual([
    'Left front',
    'Right front',
    'Left rear',
    'Right rear',
  ]);

  const first = captureNext();
  expect(current().tyres[0].state).toBe('captured');
  store().setAnalysisPending(first);

  const t0 = current().tyres[0];
  expect(t0.state).toBe('pending_analysis');
  expect(t0.result).toBeNull();
  expect(t0.sidewallFrames).toHaveLength(8);
  expect(t0.treadFrames).toHaveLength(10);
  expect(t0.sidewallDetails.size).toBe('215/65 R15');
  expect(nextTyre(current())?.position).toBe('Right front');

  const second = captureNext();
  store().setResult(second, goodResult);
  store().skipTyre(nextTyre(current())!.id);
  const fourth = captureNext();
  store().setAnalysisPending(fourth);

  const insp = current();
  expect(nextTyre(insp)).toBeNull();
  expect(analysedTyres(insp).map(t => t.position)).toEqual(['Right front']);
  expect(pendingTyres(insp).map(t => t.position)).toEqual(['Left front', 'Right rear']);
  expect(scannedTyres(insp)).toHaveLength(3);
  expect(resumeRoutes(insp)).toEqual([{ name: 'InspectionProgress' }]);

  const summary = reportSummary(insp);
  expect(summary.status).toBe('good');
  expect(summary.detail).toBe("2 tyres are waiting for analysis. 1 tyre wasn't scanned.");

  const id = store().completeInspection();
  expect(id).toBe(insp.id);
  expect(store().currentId).toBeNull();
  expect(store().inspections[0].completedAt).not.toBeNull();
});

test('Scan this tyre again from pending restarts its capture', () => {
  store().startInspection('tflite-unconfigured');
  store().selectTyres(positionsFor(2));
  const id = captureNext();
  store().setAnalysisPending(id);
  store().resetTyre(id);
  const tyre = current().tyres[0];
  expect(tyre.state).toBe('capturing_sidewall');
  expect(tyre.sidewallFrames).toEqual([]);
  expect(nextTyre(current())?.id).toBe(id);
});

test('Scan this tyre again keeps the sidewall details already filled in', () => {
  store().startInspection('tflite-unconfigured');
  store().selectTyres(positionsFor(2));
  const id = captureNext();
  store().setSidewallDetails(id, { size: null, dotTin: '0124', make: 'Continental', model: 'ComfortContact' });
  store().setAnalysisPending(id);
  store().resetTyre(id);
  const tyre = current().tyres[0];
  expect(tyre.sidewallFrames).toEqual([]);
  expect(tyre.result).toBeNull();
  expect(tyre.sidewallDetails).toEqual({
    size: null,
    dotTin: '0124',
    make: 'Continental',
    model: 'ComfortContact',
  });
});

test('a resumed inspection with a pending first tyre continues at the second', () => {
  store().startInspection('tflite-unconfigured');
  store().selectTyres(positionsFor(2));
  store().setAnalysisPending(captureNext());
  const rear = current().tyres[1];
  store().updateTyre(rear.id, { state: 'capturing_sidewall' });
  expect(resumeRoutes(current())).toEqual([
    { name: 'InspectionProgress' },
    { name: 'SidewallCapture', params: { tyreId: rear.id } },
  ]);
});

test('pending state and frames survive a restart', async () => {
  const repo = new MemoryInspectionRepository();
  const stop = await startPersistence(repo);
  store().startInspection('tflite-unconfigured');
  store().setVehicle({ plate: 'KHI-4420', chassis: 'NHP101234567' });
  store().selectTyres(positionsFor(2));
  store().setAnalysisPending(captureNext());
  // Let the queued writes finish.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
  stop();

  store().replaceAll([], null);
  const stop2 = await startPersistence(repo);
  const restored = current();
  expect(restored.plate).toBe('KHI-4420');
  expect(restored.chassis).toBe('NHP101234567');
  expect(restored.tyres[0].state).toBe('pending_analysis');
  expect(restored.tyres[0].treadFrames).toHaveLength(10);
  expect(nextTyre(restored)?.position).toBe('Rear');
  stop2();
});

test('a pending tyre whose frames vanished goes back to capture on restart', async () => {
  (exists as jest.Mock).mockResolvedValue(false);
  const insp: Inspection = {
    id: 'i',
    createdAt: '2026-11-04T11:40:00Z',
    completedAt: null,
    plate: null,
    chassis: null,
    reportPath: null,
    analyzerVersion: 'tflite-unconfigured',
    tyres: [
      {
        id: 't',
        position: 'Front',
        state: 'pending_analysis',
        sidewallFrames: ['frames/i/t/sidewall_1.jpg'],
        treadFrames: ['frames/i/t/tread_1.jpg'],
        result: null,
        errorReason: null,
        sidewallDetails: { size: null, dotTin: null, make: null, model: null },
      },
    ],
  };
  const [fixed] = await reconcileFrames([insp]);
  expect(fixed.tyres[0].state).toBe('capturing_sidewall');
  expect(fixed.tyres[0].sidewallFrames).toEqual([]);
});

test('discarding an unfinished inspection removes it and clears the current one', () => {
  const id = store().startInspection('tflite-unconfigured');
  store().selectTyres(positionsFor(2));
  store().discardInspection(id);
  expect(store().inspections).toEqual([]);
  expect(store().currentId).toBeNull();
});
