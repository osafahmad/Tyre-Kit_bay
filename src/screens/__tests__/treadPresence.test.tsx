import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { TyreResultScreen } from '../TyreResult/TyreResultScreen';
import { NO_TREAD_TITLE, treadWearCardContent, wearPatternRowValue } from '../TyreResult/TreadWearCard';
import { useInspectionStore } from '../../features/inspection/store';
import type { TyreResult } from '../../features/inspection/types';
import type { TreadPresenceVerdict } from '../../ml/services/treadPresence';
import type { TreadWearScanOutcome } from '../../ml/services/TreadWearDetector';

// Tyre result when the tread frames show a wall or floor (owner request
// 2026-11-13): no `6.2 mm · Good`, no `No Surface Defects Detected`, a clear
// "No tyre tread detected" state and the rescan as the main action.

const mockScan = jest.fn<Promise<TreadWearScanOutcome>, [string[], (() => boolean)?]>();
jest.mock('../../ml/services/TreadWearDetector', () => ({
  getTreadWearDetector: () => ({ scan: (f: string[], c?: () => boolean) => mockScan(f, c) }),
}));
const mockValidate = jest.fn<Promise<TreadPresenceVerdict>, [string[], (() => boolean)?]>();
jest.mock('../../ml/services/treadPresence', () => ({
  ...jest.requireActual('../../ml/services/treadPresence'),
  getTreadPresenceValidator: () => ({ validate: (f: string[], c?: () => boolean) => mockValidate(f, c) }),
}));

const verdict = (reason: TreadPresenceVerdict['reason']): TreadPresenceVerdict => ({
  isTyreTread: reason === 'ok',
  confidence: reason === 'ok' ? 1 : 0,
  reason,
  metrics: { framesChecked: 3, framesReadable: 3, framesPassed: reason === 'ok' ? 3 : 0, frames: [], unreadable: [] },
});

/** The demo analyzer's first result: what a wall sweep showed before this change. */
const demoResult: TyreResult = {
  status: 'good',
  treadDepthMm: 6.2,
  treadConfidence: 0.9,
  wearPattern: 'Even wear',
  damageFound: false,
  damageConfidence: 0.8,
  size: '215/65 R15',
  rimInches: 15,
  make: 'Bridgestone',
  model: 'Ecopia EP150',
  dotTin: '4B7K 2JX 2623',
  ageYears: 3,
  ageMonths: 4,
};

function seed() {
  const store = useInspectionStore.getState();
  store.replaceAll([], null);
  const inspectionId = store.startInspection('demo-test');
  store.selectTyres(['Left front', 'Right front']);
  const tyreId = useInspectionStore.getState().inspections[0].tyres[0].id;
  store.setTreadCaptured(tyreId, ['frames/t1.jpg', 'frames/t2.jpg', 'frames/t3.jpg']);
  store.setResult(tyreId, demoResult);
  return { inspectionId, tyreId };
}

const navigation = { goBack: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(), reset: jest.fn() };
const flush = () => act(async () => new Promise<void>(r => setTimeout(r, 0)));

async function show(params: { inspectionId: string; tyreId: string }) {
  await render(
    <TyreResultScreen navigation={navigation as never} route={{ key: 'TyreResult', name: 'TyreResult', params } as never} />,
  );
  await flush();
}

beforeEach(() => {
  mockScan.mockReset();
  mockValidate.mockReset();
  navigation.navigate.mockReset();
});

test('a wall sweep: "No tyre tread detected" with the groove hint; no 6.2 mm, Good, defects line or damage value', async () => {
  mockValidate.mockResolvedValue(verdict('too_smooth_no_grooves'));
  const params = seed();
  await show(params);

  expect(mockValidate).toHaveBeenCalledWith(['frames/t1.jpg', 'frames/t2.jpg', 'frames/t3.jpg'], expect.any(Function));
  expect(mockScan).not.toHaveBeenCalled();
  expect(screen.getAllByText(NO_TREAD_TITLE).length).toBeGreaterThanOrEqual(2); // header and banner
  expect(screen.getByTestId('no-tread-banner')).toBeTruthy();
  expect(
    screen.getAllByText("Could not see tyre tread grooves. Hold the camera closer to the tyre's tread pattern and sweep across the grooves.").length,
  ).toBeGreaterThanOrEqual(1);
  expect(screen.queryByText('6.2 mm')).toBeNull();
  expect(screen.queryByText('Good')).toBeNull();
  expect(screen.queryByText('Average tread depth')).toBeNull();
  expect(screen.queryByText('No Surface Defects Detected')).toBeNull();
  expect(screen.queryByText('Even wear')).toBeNull();
  // Nothing was saved to the result.
  const tyre = useInspectionStore.getState().inspections[0].tyres[0];
  expect(tyre.result?.treadWear).toBeUndefined();
  expect(tyre.result?.wearPattern).toBe('Even wear');
});

test('a bright or coloured surface gets the rubber hint', async () => {
  mockValidate.mockResolvedValue(verdict('not_rubber_surface'));
  await show(seed());
  expect(screen.getAllByText(/doesn't look like tyre rubber/).length).toBeGreaterThanOrEqual(1);
});

test('"Scan this tyre again" is the main action and resets the tyre; "Next tyre" is still there as text', async () => {
  mockValidate.mockResolvedValue(verdict('too_smooth_no_grooves'));
  const { tyreId } = seed();
  await show({ inspectionId: useInspectionStore.getState().inspections[0].id, tyreId });
  const buttons = screen.getAllByRole('button').map(b => b.props.accessibilityLabel ?? '');
  expect(buttons.indexOf('Scan this tyre again')).toBeLessThan(buttons.indexOf('Next tyre'));
  fireEvent.press(screen.getByText('Scan this tyre again'));
  expect(navigation.navigate).toHaveBeenCalledWith('SidewallCapture', { tyreId });
  expect(useInspectionStore.getState().inspections[0].tyres[0].result).toBeNull();
});

test('real tread: the presence check passes and the result shows as before', async () => {
  mockValidate.mockResolvedValue(verdict('ok'));
  mockScan.mockResolvedValue({ status: 'done', frames: [], framesFailed: 0, delegate: 'cpu', modelVersion: 'tread-test-1' });
  await show(seed());
  expect(screen.getByText('6.2 mm')).toBeTruthy();
  expect(screen.getAllByText('No Surface Defects Detected').length).toBeGreaterThanOrEqual(1); // card badge and row
  expect(screen.queryByTestId('no-tread-banner')).toBeNull();
});

test('card content and Wear pattern row for the no_tread state', () => {
  const state = { status: 'no_tread', verdict: verdict('too_smooth_no_grooves') } as const;
  expect(treadWearCardContent(state)).toEqual(
    expect.objectContaining({ tone: 'warning', badge: NO_TREAD_TITLE, title: null, note: null }),
  );
  expect(wearPatternRowValue(state, 'Even wear')).toBeNull();
});
