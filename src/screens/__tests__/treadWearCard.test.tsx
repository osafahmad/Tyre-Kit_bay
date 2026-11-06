import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { TyreResultScreen } from '../TyreResult/TyreResultScreen';
import { TREAD_WEAR_CARD_TITLE, TreadWearCard, treadWearCardContent } from '../TyreResult/TreadWearCard';
import { useInspectionStore } from '../../features/inspection/store';
import type { TyreResult } from '../../features/inspection/types';
import { clearTreadWearCache, type TreadWearState } from '../../hooks/useTyreInspection';
import type { TreadWearClass } from '../../ml/config/treadWearConfig';
import type { TreadWearScanOutcome } from '../../ml/services/TreadWearDetector';

const mockScan = jest.fn<Promise<TreadWearScanOutcome>, [string[], (() => boolean)?]>();
jest.mock('../../ml/services/TreadWearDetector', () => ({
  getTreadWearDetector: () => ({ scan: (f: string[], c?: () => boolean) => mockScan(f, c) }),
}));

const finding = (label: TreadWearClass, maxConfidence: number) => ({ label, maxConfidence, frames: 1 });
const done = (findings: ReturnType<typeof finding>[], severity: 'none' | 'detected' | 'critical'): TreadWearState => ({
  status: 'done',
  findings,
  severity,
  wearPattern: findings[0]?.label ?? null,
  frames: [],
  framesFailed: 0,
});

describe('treadWearCardContent', () => {
  test('busy states say the check is running, with no badge', () => {
    expect(treadWearCardContent({ status: 'scanning' })).toEqual(
      expect.objectContaining({ badge: null, lines: ['Checking tread wear on this phone…'] }),
    );
  });

  test.each([
    ['model_missing', "The tread wear model isn't available on this phone."],
    ['no_frames', 'There are no saved tread frames to check.'],
    ['unreadable', "The saved tread frames couldn't be read."],
  ] as const)('unavailable (%s) is "Not checked", never "Normal"', (reason, text) => {
    expect(treadWearCardContent({ status: 'unavailable', reason })).toEqual(
      expect.objectContaining({ tone: 'neutral', badge: 'Not checked', lines: [text] }),
    );
  });

  test('nothing found: Normal Wear Distribution', () => {
    expect(treadWearCardContent(done([], 'none'))).toEqual(
      expect.objectContaining({ tone: 'normal', badge: 'Normal Wear Distribution', title: null }),
    );
  });

  test('below 0.60: warning badge with title, cause and advice', () => {
    expect(treadWearCardContent(done([finding('Feather Edge', 0.45)], 'detected'))).toEqual({
      tone: 'warning',
      badge: 'Wear pattern found',
      title: 'Feathered Wear',
      lines: ['Likely cause: Toe alignment fault', 'Advice: Perform wheel alignment'],
      alsoSeen: [],
    });
  });

  test('0.60 and above: critical badge with urgent maintenance advice', () => {
    expect(treadWearCardContent(done([finding('Center Wear', 0.6)], 'critical'))).toEqual({
      tone: 'critical',
      badge: 'Maintenance needed',
      title: 'Center Tread Wear',
      lines: ['Likely cause: Over-inflation', 'Get this checked as soon as possible: adjust tyre pressure.'],
      alsoSeen: [],
    });
  });

  test('unmapped class: clean title only, no made-up cause or advice', () => {
    expect(treadWearCardContent(done([finding('River_Channel Erosion Wear', 0.4)], 'detected'))).toEqual(
      expect.objectContaining({ title: 'River Channel Erosion Wear', lines: [] }),
    );
    expect(treadWearCardContent(done([finding('Wavy Wear', 0.7)], 'critical')).lines).toEqual([
      'Get this checked as soon as possible.',
    ]);
  });

  test('other findings are listed once each, without repeating the main title', () => {
    const c = treadWearCardContent(
      done(
        [
          finding('Shoulder Wear Left', 0.5),
          finding('Shoulder Wear Right', 0.4),
          finding('Spotty Wear', 0.35),
          finding('Rip Depression and Punch Wear', 0.3),
        ],
        'detected',
      ),
    );
    expect(c.title).toBe('Shoulder Wear');
    expect(c.alsoSeen).toEqual(['Patchy Spot Wear']);
  });
});

test('TreadWearCard announces the finished check', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  await render(<TreadWearCard state={done([finding('Center Wear', 0.8)], 'critical')} />);
  expect(screen.getByText('Maintenance needed')).toBeTruthy();
  expect(announce).toHaveBeenCalledWith('Tread wear check: Maintenance needed: Center Tread Wear');
  announce.mockRestore();
});

describe('Tyre result screen', () => {
  const result: TyreResult = {
    status: 'good',
    treadDepthMm: null,
    treadConfidence: null,
    wearPattern: null,
    damageFound: null,
    damageConfidence: null,
    size: '215/65 R15',
    rimInches: 15,
    make: 'Bridgestone',
    model: 'Ecopia EP150',
    dotTin: '4B7K 2JX 2623',
    ageYears: 3,
    ageMonths: 4,
  };

  function seed(): { inspectionId: string; tyreId: string } {
    const store = useInspectionStore.getState();
    store.replaceAll([], null);
    const inspectionId = store.startInspection('tflite-test');
    store.selectTyres(['Left front']);
    const tyreId = useInspectionStore.getState().inspections[0].tyres[0].id;
    store.setTreadCaptured(tyreId, ['frames/t1.jpg', 'frames/t2.jpg']);
    store.setResult(tyreId, result);
    return { inspectionId, tyreId };
  }

  const navigation = { goBack: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(), reset: jest.fn() };

  async function show(params: { inspectionId: string; tyreId: string }) {
    await render(
      <TyreResultScreen
        navigation={navigation as never}
        route={{ key: 'TyreResult', name: 'TyreResult', params } as never}
      />,
    );
  }

  beforeEach(() => {
    mockScan.mockReset();
    clearTreadWearCache();
  });

  test('scans the saved tread frames and shows a critical card; sidewall values stay as saved', async () => {
    let finish!: (o: TreadWearScanOutcome) => void;
    mockScan.mockImplementation(() => new Promise(r => (finish = r)));
    const params = seed();
    const before = JSON.stringify(useInspectionStore.getState().inspections);
    await show(params);

    expect(screen.getByText(TREAD_WEAR_CARD_TITLE)).toBeTruthy();
    expect(screen.getByText('Checking tread wear on this phone…')).toBeTruthy();
    expect(mockScan).toHaveBeenCalledWith(['frames/t1.jpg', 'frames/t2.jpg'], expect.any(Function));

    await act(async () => {
      finish({
        status: 'done',
        frames: [{ frame: 'frames/t1.jpg', detections: [{ label: 'Center Wear', confidence: 0.72, bbox: [0, 0, 0.5, 0.5], frameRect: null }] }],
        framesFailed: 0,
        delegate: 'cpu',
      });
    });

    expect(screen.getByText('Maintenance needed')).toBeTruthy();
    expect(screen.getByText('Center Tread Wear')).toBeTruthy();
    expect(screen.getByText('Likely cause: Over-inflation')).toBeTruthy();
    // Status and sidewall rows unchanged.
    expect(screen.getByText('Good')).toBeTruthy();
    for (const v of ['215/65 R15', 'Bridgestone', 'Ecopia EP150', '4B7K 2JX 2623']) {
      expect(screen.getByText(v)).toBeTruthy();
    }
    expect(JSON.stringify(useInspectionStore.getState().inspections)).toBe(before);
  });

  test('model missing shows "Not checked", not a normal result', async () => {
    mockScan.mockResolvedValue({ status: 'unavailable', reason: 'model_missing' });
    await show(seed());
    await act(async () => {});
    expect(screen.getByText('Not checked')).toBeTruthy();
    expect(screen.queryByText('Normal Wear Distribution')).toBeNull();
  });

  test('reopening the same tyre uses the finished scan instead of running the model again', async () => {
    mockScan.mockResolvedValue({ status: 'done', frames: [{ frame: 'a', detections: [] }], framesFailed: 0, delegate: 'cpu' });
    const params = seed();
    await show(params);
    await act(async () => {});
    expect(screen.getByText('Normal Wear Distribution')).toBeTruthy();
    await screen.unmount();
    await show(params);
    await act(async () => {});
    expect(screen.getByText('Normal Wear Distribution')).toBeTruthy();
    expect(mockScan).toHaveBeenCalledTimes(1);
  });
});
