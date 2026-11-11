import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { TyreResultScreen } from '../TyreResult/TyreResultScreen';
import {
  TREAD_WEAR_CARD_TITLE,
  TreadWearCard,
  WEAR_ROW_PENDING,
  treadWearCardContent,
  wearPatternRowValue,
} from '../TyreResult/TreadWearCard';
import { useInspectionStore } from '../../features/inspection/store';
import type { TyreResult } from '../../features/inspection/types';
import { buildTreadWearRecord } from '../../features/inspection/treadWear';
import type { TreadWearState } from '../../hooks/useTyreInspection';
import type { TreadWearClass } from '../../ml/config/treadWearConfig';
import type { TreadWearScanOutcome } from '../../ml/services/TreadWearDetector';
import { setTreadDebug } from '../../ml/services/treadDebug';

const mockScan = jest.fn<Promise<TreadWearScanOutcome>, [string[], (() => boolean)?]>();
jest.mock('../../ml/services/TreadWearDetector', () => ({
  getTreadWearDetector: () => ({ scan: (f: string[], c?: () => boolean) => mockScan(f, c) }),
}));

/** A finding; at 0.70 or above it is taken as agreed by 3 frames (`TREAD_WEAR_CONSENSUS`) unless told otherwise. */
const finding = (label: TreadWearClass, maxConfidence: number, consensusFrames = maxConfidence >= 0.7 ? 3 : 0) => ({
  label,
  maxConfidence,
  frames: Math.max(1, consensusFrames),
  consensusFrames,
});
const NOTE = 'Beta / Model Unverified';
/** `n` frames that each detect `label` at `confidence`. */
const framesWith = (label: TreadWearClass, confidence: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    frame: `frames/t${i + 1}.jpg`,
    detections: [{ label, confidence, bbox: [0, 0, 0.5, 0.5] as [number, number, number, number], frameRect: null }],
  }));
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

  test('nothing found: No Abnormal Wear Pattern Detected, not escalated, no note', () => {
    expect(treadWearCardContent(done([], 'none'))).toEqual(
      expect.objectContaining({ tone: 'normal', badge: 'No Abnormal Wear Pattern Detected', title: null, note: null }),
    );
  });

  test('no consensus: warning badge with the title and the note; no cause or advice until the owner supplies it', () => {
    expect(treadWearCardContent(done([finding('feathering', 0.45)], 'detected'))).toEqual({
      tone: 'warning',
      badge: 'Wear pattern found',
      title: 'Feathering',
      lines: [],
      alsoSeen: [],
      note: NOTE,
    });
    // Strong, but in too few frames (the Redmi 13 sidewall scan needed 3): still not critical.
    expect(treadWearCardContent(done([finding('camber_wear', 0.98, 2)], 'detected'))).toEqual(
      expect.objectContaining({ tone: 'warning', badge: 'Wear pattern found', lines: [], note: NOTE }),
    );
  });

  test('3 frames at 0.70 or above: critical badge with urgent maintenance advice and the note', () => {
    expect(treadWearCardContent(done([finding('center_wear', 0.7)], 'critical'))).toEqual({
      tone: 'critical',
      badge: 'Maintenance needed',
      title: 'Center Wear',
      lines: ['Get this checked as soon as possible.'],
      alsoSeen: [],
      note: NOTE,
    });
  });

  test('class names become clean titles, with no made-up cause or advice', () => {
    expect(treadWearCardContent(done([finding('cracking_dry_rot', 0.7)], 'critical'))).toEqual(
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

describe('wearPatternRowValue', () => {
  test.each([['idle'], ['scanning']] as const)('%s: the pending text, never the earlier value', status => {
    expect(wearPatternRowValue({ status }, 'Even wear')).toBe(WEAR_ROW_PENDING);
    expect(wearPatternRowValue({ status }, null)).toBe(WEAR_ROW_PENDING);
  });

  test('finished or saved: the saved value; a finding carries the staging note', () => {
    const d = done([finding('center_wear', 0.7)], 'critical');
    expect(wearPatternRowValue(d, 'Center Wear')).toBe(`Center Wear (${NOTE})`);
    if (d.status !== 'done') throw new Error('unreachable');
    expect(wearPatternRowValue({ status: 'saved', record: d.record }, 'Center Wear')).toBe(`Center Wear (${NOTE})`);
    const none = done([], 'none');
    expect(wearPatternRowValue(none, 'No Abnormal Wear Pattern Detected')).toBe('No Abnormal Wear Pattern Detected');
  });

  test('model unavailable: the row is left as it was', () => {
    expect(wearPatternRowValue({ status: 'unavailable', reason: 'model_missing' }, null)).toBeNull();
  });
});

test('TreadWearCard announces the finished check', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  await render(<TreadWearCard state={done([finding('center_wear', 0.8)], 'critical')} />);
  expect(screen.getByText('Maintenance needed')).toBeTruthy();
  expect(screen.getByText(`(${NOTE})`)).toBeTruthy();
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
        frames: framesWith('center_wear', 0.72, 3),
        framesFailed: 0,
        delegate: 'cpu',
        modelVersion: 'tread-test-1',
      });
    });

    expect(screen.getByText('Maintenance needed')).toBeTruthy();
    // Card title and the Wear pattern row now say the same thing.
    expect(screen.getByText('Center Wear')).toBeTruthy();
    expect(screen.getByLabelText(`Wear pattern: Center Wear (${NOTE})`)).toBeTruthy();
    expect(screen.getByTestId('tread-wear-unverified')).toBeTruthy();
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

  test('the Wear pattern row waits for the active scan to settle before showing the final title', async () => {
    let finish!: (o: TreadWearScanOutcome) => void;
    mockScan.mockImplementation(() => new Promise(r => (finish = r)));
    const params = seed();
    // An initial value saved with the result (e.g. from the analyzer) that the scan will replace.
    useInspectionStore.getState().setResult(params.tyreId, { ...result, wearPattern: 'Even wear' });
    await show(params);

    // Scanning: the row and the card are both pending; the earlier value never shows.
    expect(screen.getByText('Checking tread wear on this phone…')).toBeTruthy();
    expect(screen.getByLabelText(`Wear pattern: ${WEAR_ROW_PENDING}`)).toBeTruthy();
    expect(screen.queryByText('Even wear')).toBeNull();
    expect(screen.queryByText('Center Wear')).toBeNull();

    // Re-renders during the scan (a store update) still show the pending text.
    await act(async () => {
      useInspectionStore.getState().setResult(params.tyreId, { ...result, wearPattern: 'Even wear' });
    });
    expect(screen.getByLabelText(`Wear pattern: ${WEAR_ROW_PENDING}`)).toBeTruthy();
    expect(screen.queryByText('Even wear')).toBeNull();

    await act(async () => {
      finish({
        status: 'done',
        frames: [
          { frame: 'frames/t1.jpg', detections: [{ label: 'center_wear', confidence: 0.72, bbox: [0, 0, 0.5, 0.5], frameRect: null }] },
          { frame: 'frames/t2.jpg', detections: [{ label: 'center_wear', confidence: 0.65, bbox: [0, 0, 0.5, 0.5], frameRect: null }] },
        ],
        framesFailed: 0,
        delegate: 'cpu',
        modelVersion: 'tread-test-1',
      });
    });

    // Settled: card and row show the same final title, together.
    expect(screen.queryByText(WEAR_ROW_PENDING)).toBeNull();
    expect(screen.queryByText('Checking tread wear on this phone…')).toBeNull();
    expect(screen.getByLabelText(`Wear pattern: Center Wear (${NOTE})`)).toBeTruthy();
    expect(screen.getByText('Center Wear')).toBeTruthy();
    // Two frames only, one below 0.70: found, but not escalated.
    expect(screen.getByText('Wear pattern found')).toBeTruthy();
    expect(screen.queryByText('Maintenance needed')).toBeNull();
    expect(screen.queryByText('Even wear')).toBeNull();
  });

  test('"Checking…" stays until scanTreadWear resolves, however long the scan takes', async () => {
    let finish!: (o: TreadWearScanOutcome) => void;
    mockScan.mockImplementation(() => new Promise(r => (finish = r)));
    const params = seed();
    useInspectionStore.getState().setResult(params.tyreId, { ...result, wearPattern: 'Even' });
    await show(params);
    // Many ticks pass while the model runs: nothing settles early.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise<void>(r => setTimeout(r, 0));
      });
      expect(screen.getByLabelText(`Wear pattern: ${WEAR_ROW_PENDING}`)).toBeTruthy();
      expect(screen.getByText('Checking tread wear on this phone…')).toBeTruthy();
    }
    expect(mockScan).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ status: 'done', frames: [{ frame: 'frames/t1.jpg', detections: [] }], framesFailed: 0, delegate: 'core-ml', modelVersion: 'tread-test-1' });
    });
    expect(screen.getByLabelText('Wear pattern: No Abnormal Wear Pattern Detected')).toBeTruthy();
  });

  test('after capture: Tyre result scans the frames saved for this tyre', async () => {
    mockScan.mockResolvedValue({ status: 'done', frames: [{ frame: 'a', detections: [] }], framesFailed: 0, delegate: 'cpu', modelVersion: 'tread-test-1' });
    const store = useInspectionStore.getState();
    store.replaceAll([], null);
    const inspectionId = store.startInspection('tflite-test');
    store.selectTyres(['Left front']);
    const tyreId = useInspectionStore.getState().inspections[0].tyres[0].id;
    // Same order as the app: tread frames saved by capture, then Analysing sets the result.
    store.setTreadCaptured(tyreId, ['frames/a.jpg', 'frames/b.jpg', 'frames/c.jpg']);
    store.setResult(tyreId, result);
    await show({ inspectionId, tyreId });
    await act(async () => {});
    expect(mockScan).toHaveBeenCalledWith(['frames/a.jpg', 'frames/b.jpg', 'frames/c.jpg'], expect.any(Function));
    expect(useInspectionStore.getState().inspections[0].tyres[0].result!.treadWear).toEqual(
      expect.objectContaining({ severity: 'none' }),
    );
  });

  test('[TreadWear] logs show the scan start, the consensus and when the card and row update', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    setTreadDebug(true);
    try {
      let finish!: (o: TreadWearScanOutcome) => void;
      mockScan.mockImplementation(() => new Promise(r => (finish = r)));
      await show(seed());
      await act(async () => {
        finish({
          status: 'done',
          frames: framesWith('center_wear', 0.72, 3),
          framesFailed: 0,
          delegate: 'core-ml',
          modelVersion: 'tread-test-1',
        });
      });
      const lines = log.mock.calls.map(c => c.map(String).join(' '));
      const at = (needle: string) => lines.findIndex(l => l.includes(needle));
      expect(lines[at('scanTreadWear started')]).toContain('"savedTreadFrames":2');
      expect(lines[at('consensus')]).toContain('"title":"Center Wear"');
      expect(at('UI committed: card scanning, Wear pattern row "Checking…"')).toBeGreaterThan(-1);
      const resolved = at('scanTreadWear resolved');
      const committed = at('UI committed: card done, Wear pattern row "Center Wear');
      expect(resolved).toBeGreaterThan(at('consensus'));
      expect(committed).toBeGreaterThan(resolved);
      for (const l of lines) expect(l).toMatch(/^\[TreadWear\] \d\d:\d\d:\d\d\.\d{3} /);
    } finally {
      setTreadDebug(false);
      log.mockRestore();
    }
  });

  test('model missing: once settled, the Wear pattern row is left as it was', async () => {
    mockScan.mockResolvedValue({ status: 'unavailable', reason: 'model_missing' });
    await show(seed());
    await act(async () => {});
    expect(screen.queryByText(WEAR_ROW_PENDING)).toBeNull();
    expect(screen.getByLabelText('Wear pattern: Not read')).toBeTruthy();
  });

  test('a sidewall bulge in one frame is shown but does not change the status', async () => {
    mockScan.mockResolvedValue({
      status: 'done',
      frames: framesWith('sidewall_bulge', 0.95, 1),
      framesFailed: 0,
      delegate: 'cpu',
      modelVersion: 'tread-test-1',
    });
    await show(seed());
    await act(async () => {});
    expect(screen.getByText('Good')).toBeTruthy();
    expect(screen.queryByText('Replace now')).toBeNull();
    expect(screen.getByText('Wear pattern found')).toBeTruthy();
    expect(useInspectionStore.getState().inspections[0].tyres[0].result!.status).toBe('good');
  });

  test('a sidewall bulge in 3 frames at 0.70 or more raises the shown status to Replace now, with its text label', async () => {
    mockScan.mockResolvedValue({
      status: 'done',
      frames: framesWith('sidewall_bulge', 0.7, 3),
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
    expect(screen.queryByText('No Abnormal Wear Pattern Detected')).toBeNull();
  });

  test('reopening the tyre shows the saved check instead of running the model again', async () => {
    mockScan.mockResolvedValue({ status: 'done', frames: [{ frame: 'a', detections: [] }], framesFailed: 0, delegate: 'cpu', modelVersion: 'tread-test-1' });
    const params = seed();
    await show(params);
    await act(async () => {});
    expect(screen.getByLabelText('Tread wear: No Abnormal Wear Pattern Detected')).toBeTruthy();
    expect(screen.getByLabelText('Wear pattern: No Abnormal Wear Pattern Detected')).toBeTruthy();
    await screen.unmount();
    await show(params);
    await act(async () => {});
    expect(screen.getByLabelText('Tread wear: No Abnormal Wear Pattern Detected')).toBeTruthy();
    expect(screen.getByLabelText('Wear pattern: No Abnormal Wear Pattern Detected')).toBeTruthy();
    expect(mockScan).toHaveBeenCalledTimes(1);
  });
});
