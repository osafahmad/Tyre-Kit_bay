import { resumeRoutes } from '../resume';
import { emptySidewallDetails } from '../store';
import type { Inspection, TyreFlowState, TyreInspection } from '../types';

const tyre = (id: string, state: TyreFlowState): TyreInspection => ({
  id,
  position: id,
  state,
  sidewallFrames: [],
  treadFrames: [],
  result: null,
  errorReason: null,
  sidewallDetails: emptySidewallDetails,
});

const inspection = (tyres: TyreInspection[]): Inspection => ({
  id: 'i',
  createdAt: '',
  completedAt: null,
  plate: null,
  chassis: null,
  tyres,
  reportPath: null,
  analyzerVersion: 'demo-1',
});

test('no tyres chosen yet: back to vehicle details', () => {
  expect(resumeRoutes(inspection([]))).toEqual([{ name: 'VehicleDetails' }]);
});

test('first tyre mid-capture reopens its step', () => {
  expect(resumeRoutes(inspection([tyre('a', 'capturing_tread'), tyre('b', 'waiting')]))).toEqual([
    { name: 'TreadCapture', params: { tyreId: 'a' } },
  ]);
  expect(resumeRoutes(inspection([tyre('a', 'captured')]))).toEqual([
    { name: 'FramesCaptured', params: { tyreId: 'a' } },
  ]);
  expect(resumeRoutes(inspection([tyre('a', 'analysing')]))).toEqual([
    { name: 'Analysing', params: { tyreId: 'a' } },
  ]);
});

test('later tyres resume on top of Inspection progress', () => {
  expect(resumeRoutes(inspection([tyre('a', 'skipped'), tyre('b', 'capturing_sidewall')]))).toEqual([
    { name: 'InspectionProgress' },
    { name: 'SidewallCapture', params: { tyreId: 'b' } },
  ]);
  expect(resumeRoutes(inspection([tyre('a', 'skipped'), tyre('b', 'waiting')]))).toEqual([
    { name: 'InspectionProgress' },
  ]);
});
