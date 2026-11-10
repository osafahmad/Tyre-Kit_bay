import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { TyreResultScreen } from '../TyreResult/TyreResultScreen';
import { TREAD_WEAR_CARD_TITLE, TreadWearCard, treadWearCardContent } from '../TyreResult/TreadWearCard';
import { useInspectionStore } from '../../features/inspection/store';
import type { TyreResult } from '../../features/inspection/types';
import { buildTreadWearRecord } from '../../features/inspection/treadWear';
import type { TreadWearState } from '../../hooks/useTyreInspection';
import type { TreadWearClass } from '../../ml/config/treadWearConfig';
import type { TreadWearScanOutcome } from '../../ml/services/TreadWearDetector';

const mockScan = jest.fn<Promise<TreadWearScanOutcome>, [string[], (() => boolean)?]>();
jest.mock('../../ml/services/TreadWearDetector', () => ({
  getTreadWearDetector: () => ({ scan: (f: string[], c?: () => boolean) => mockScan(f, c) }),
}));

const finding = (label: TreadWearClass, maxConfidence: number) => ({ label, maxConfidence, frames: 1 });
/** A just-finished check. `severity` is what the record builder must have worked out. */
const done = (findings: ReturnType<typeof finding>[], severity: 'none' | 'detected' | 'critical'): TreadWearState => {
  const record = buildTreadWearRecord(findings, 'tread-test-1');
  expect(record.severity).toBe(severity);
  return { status: 'done', record, findings, frames: [], framesFailed: 0 };
};

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

  test('below 0.60: warning badge with the title; no cause or advice until the owner supplies it', () => {
    expect(treadWearCardContent(done([finding('feathering', 0.45)], 'detected'))).toEqual({
      tone: 'warning',
      badge: 'Wear pattern found',
      title: 'Feathering',
      lines: [],
      alsoSeen: [],
    });
  });

  test('0.60 and above: critical badge with urgent maintenance advice', () => {
    expect(treadWearCardContent(done([finding('center_wear', 0.6)], 'critical'))).toEqual({
      tone: 'critical',
      badge: 'Maintenance needed',
      title: 'Center Wear',
      lines: ['Get this checked as soon as possible.'],
      alsoSeen: [],
    });
  });

  test('class names become clean titles, with no made-up cause or advice', () => {
    expect(treadWearCardContent(done([finding('cracking_dry_rot', 0.4)], 'critical'))).toEqual(
      expect.objectContaining({ title: 'Cracking Dry Rot', lines: ['Get this checked as soon as possible.'] }),
    );
  });

  test('other findings are listed once each, without repeating the main title', () => {
    const c = treadWearCardContent(
      done(
        [
          finding('shoulder_wear', 0.5),
          finding('flat_spot', 0.4),
          finding('camber_wear', 0.36),
        ],
        'detected',
      ),
    );
    expect(c.title).toBe('Shoulder Wear');
    expect(c.alsoSeen).toEqual(['Flat Spot', 'Camber Wear']);
  });
});

test('TreadWearCard announces the finished check', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  await render(<TreadWearCard state={done([finding('center_wear', 0.8)], 'critical')} />);
  expect(screen.getByText('Maintenance needed')).toBeTruthy();
  expect(announce).toHaveBeenCalledWith('Tread wear check: Maintenance needed: Center Wear');
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
  });

  test('scans the saved tread frames, shows a critical card and saves it to the Wear pattern row', async () => {
    let finish!: (o: TreadWearScanOutcome) => void;
    mockScan.mockImplementation(() => new Promise(r => (finish = r)));
    const params = seed();
    await show(params);

    expect(screen.getByText(TREAD_WEAR_CARD_TITLE)).toBeTruthy();
    expect(screen.getByText('Checking tread wear on this phone…')).toBeTruthy();
    expect(mockScan).toHaveBeenCalledWith(['frames/t1.jpg', 'frames/t2.jpg'], expect.any(Function));

    await act(async () => {
      finish({
        status: 'done',
        frames: [{ frame: 'frames/t1.jpg', detections: [{ label: 'center_wear', confidence: 0.72, bbox: [0, 0, 0.5, 0.5], frameRect: null }] }],
        framesFailed: 0,
        delegate: 'cpu',
        modelVersion: 'tread-test-1',
      });
    });

    expect(screen.getByText('Maintenance needed')).toBeTruthy();
    // Card title and the Wear pattern row now say the same thing.
    expect(screen.getAllByText('Center Wear')).toHaveLength(2);
    expect(screen.getByLabelText('Wear pattern: Center Wear')).toBeTruthy();
    expect(screen.queryByText(/Likely cause/)).toBeNull();
    // Status and sidewall rows unchanged.
    expect(screen.getByText('Good')).toBeTruthy();
    for (const v of ['215/65 R15', 'Bridgestone', 'Ecopia EP150', '4B7K 2JX 2623']) {
      expect(screen.getByText(v)).toBeTruthy();
    }
    const saved = useInspectionStore.getState().inspections[0].tyres[0].result!;
    expect(saved).toEqual({
      ...result,
      wearPattern: 'Center Wear',
      treadWear: expect.objectContaining({ severity: 'critical', label: 'center_wear', confidence: 0.72 }),
    });
  });

  test('a sidewall bulge at 0.50 or more raises the shown status to Replace now, with its text label', async () => {
    mockScan.mockResolvedValue({
      status: 'done',
      frames: [{ frame: 'frames/t1.jpg', detections: [{ label: 'sidewall_bulge', confidence: 0.6, bbox: [0, 0, 0.5, 0.5], frameRect: null }] }],
      framesFailed: 0,
      delegate: 'cpu',
      modelVersion: 'tread-test-1',
    });
    await show(seed());
    await act(async () => {});
    expect(screen.queryByText('Good')).toBeNull();
    expect(screen.getByText('Replace now')).toBeTruthy();
    expect(screen.getAllByText('Sidewall Bulge').length).toBeGreaterThan(0);
    expect(useInspectionStore.getState().inspections[0].tyres[0].result!.status).toBe('replace_now');
  });

  test('model missing shows "Not checked", not a normal result', async () => {
    mockScan.mockResolvedValue({ status: 'unavailable', reason: 'model_missing' });
    await show(seed());
    await act(async () => {});
    expect(screen.getByText('Not checked')).toBeTruthy();
    expect(screen.queryByText('Normal Wear Distribution')).toBeNull();
  });

  test('reopening the tyre shows the saved check instead of running the model again', async () => {
    mockScan.mockResolvedValue({ status: 'done', frames: [{ frame: 'a', detections: [] }], framesFailed: 0, delegate: 'cpu', modelVersion: 'tread-test-1' });
    const params = seed();
    await show(params);
    await act(async () => {});
    expect(screen.getByLabelText('Tread wear: Normal Wear Distribution')).toBeTruthy();
    expect(screen.getByLabelText('Wear pattern: Normal Wear Distribution')).toBeTruthy();
    await screen.unmount();
    await show(params);
    await act(async () => {});
    expect(screen.getByLabelText('Tread wear: Normal Wear Distribution')).toBeTruthy();
    expect(screen.getByLabelText('Wear pattern: Normal Wear Distribution')).toBeTruthy();
    expect(mockScan).toHaveBeenCalledTimes(1);
  });
});
