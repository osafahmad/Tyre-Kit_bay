import React from 'react';
import { act, render } from '@testing-library/react-native';
import { useInspectionStore } from '../../features/inspection/store';
import type { TyreResult } from '../../features/inspection/types';
import type { TreadWearClass } from '../../ml/config/treadWearConfig';
import type { TreadWearScanOutcome, TreadWearScanner } from '../../ml/services/TreadWearDetector';
import { summariseTreadWear, treadWearSeverity, useTyreInspection } from '../useTyreInspection';

const store = () => useInspectionStore.getState();
const tyre = (id: string) => store().inspections[0].tyres.find(t => t.id === id)!;

function det(label: TreadWearClass, confidence: number) {
  return { label, confidence, bbox: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number], frameRect: null };
}

function done(frames: { frame: string; detections: ReturnType<typeof det>[] }[]): TreadWearScanOutcome {
  return { status: 'done', frames, framesFailed: 0, delegate: 'cpu', modelVersion: 'tread-test-1' };
}

const scanner = (outcome: TreadWearScanOutcome): TreadWearScanner & { scan: jest.Mock } => ({
  scan: jest.fn(async () => outcome),
});

const analysed: TyreResult = {
  status: 'good',
  treadDepthMm: 6.2,
  treadConfidence: 0.9,
  wearPattern: null,
  damageFound: false,
  damageConfidence: 0.8,
  size: '215/65 R15',
  rimInches: 15,
  make: 'Michelin',
  model: 'Primacy 4',
  dotTin: '4B7K 2JX 2623',
  ageYears: 3,
  ageMonths: 4,
};

/** One inspection with two tyres; the first is captured (tread frames, sidewall details) and analysed. */
function seed({ withResult = true } = {}): [string, string] {
  store().replaceAll([], null);
  store().startInspection('test');
  store().selectTyres(['Left front', 'Right front']);
  const [a, b] = store().inspections[0].tyres;
  store().setSidewallCaptured(a.id, ['s1.jpg'], { size: '215/65 R15', dotTin: null, make: 'Michelin', model: null });
  store().setTreadCaptured(a.id, ['t1.jpg', 't2.jpg']);
  if (withResult) store().setResult(a.id, analysed);
  return [a.id, b.id];
}

let hook: ReturnType<typeof useTyreInspection>;
function Harness({ tyreId, s, autoScan = false }: { tyreId: string; s: TreadWearScanner; autoScan?: boolean }) {
  hook = useTyreInspection(tyreId, { treadWearScanner: s, autoScan });
  return null;
}

async function scan() {
  await act(async () => {
    await hook.scanTreadWear();
  });
}

describe('severity and summary', () => {
  test('one finding per class: highest confidence, frames counted once each', () => {
    const findings = summariseTreadWear([
      { frame: 'a', detections: [det('center_wear', 0.4), det('center_wear', 0.5), det('feathering', 0.3)] },
      { frame: 'b', detections: [det('center_wear', 0.7), det('normal_even_wear', 0.9)] },
    ]);
    expect(findings).toEqual([
      { label: 'center_wear', maxConfidence: 0.7, frames: 2 },
      { label: 'feathering', maxConfidence: 0.3, frames: 1 },
    ]);
  });

  test('normal_even_wear alone is no finding: severity none', () => {
    const findings = summariseTreadWear([{ frame: 'a', detections: [det('normal_even_wear', 0.95)] }]);
    expect(findings).toEqual([]);
    expect(treadWearSeverity(findings)).toBe('none');
  });

  test('critical at 0.60 and above, detected below, none without findings', () => {
    expect(treadWearSeverity([])).toBe('none');
    expect(treadWearSeverity([{ label: 'flat_spot', maxConfidence: 0.599 }])).toBe('detected');
    expect(treadWearSeverity([{ label: 'flat_spot', maxConfidence: 0.6 }])).toBe('critical');
  });
});

describe('useTyreInspection', () => {
  test('saves the check into the result: wear fields only when nothing raises the status; sidewall values untouched', async () => {
    const [a] = seed();
    const s = scanner(done([{ frame: 't1.jpg', detections: [det('center_wear', 0.65), det('feathering', 0.3)] }]));
    await render(<Harness tyreId={a} s={s} />);

    expect(hook.treadWear).toEqual({ status: 'idle' });
    expect(hook.sidewallDetails).toEqual(expect.objectContaining({ size: '215/65 R15', make: 'Michelin' }));

    await scan();
    expect(s.scan).toHaveBeenCalledWith(['t1.jpg', 't2.jpg'], expect.any(Function));
    const record = {
      severity: 'critical',
      minimumStatus: null,
      label: 'center_wear',
      title: 'Center Wear',
      cause: null,
      recommendation: 'Get this checked as soon as possible.',
      confidence: 0.65,
      alsoSeen: ['Feathering'],
      modelVersion: 'tread-test-1',
      checkedAt: expect.any(String),
    };
    expect(hook.treadWear).toEqual(expect.objectContaining({ status: 'done', record, framesFailed: 0 }));

    const saved = tyre(a);
    expect(saved.result).toEqual({ ...analysed, wearPattern: 'Center Wear', treadWear: record });
    expect(saved.state).toBe('done');
    expect(saved.sidewallDetails).toEqual({ size: '215/65 R15', dotTin: null, make: 'Michelin', model: null });
  });

  test('exposed cords at 0.50 or more: the saved status is raised to Replace now', async () => {
    const [a] = seed();
    await render(<Harness tyreId={a} s={scanner(done([{ frame: 't1.jpg', detections: [det('exposed_cords', 0.5)] }]))} />);
    await scan();
    expect(tyre(a).result).toEqual(
      expect.objectContaining({
        status: 'replace_now',
        wearPattern: 'Exposed Cords',
        treadWear: expect.objectContaining({ severity: 'critical', minimumStatus: 'replace_now' }),
      }),
    );
  });

  test('no wear found: saved as Normal Wear Distribution', async () => {
    const [a] = seed();
    await render(<Harness tyreId={a} s={scanner(done([{ frame: 't1.jpg', detections: [] }]))} />);
    await scan();
    expect(tyre(a).result).toEqual(
      expect.objectContaining({
        status: 'good',
        wearPattern: 'Normal Wear Distribution',
        treadWear: expect.objectContaining({ severity: 'none', label: null, recommendation: null, confidence: null }),
      }),
    );
  });

  test('model missing: reported as unavailable, nothing saved', async () => {
    const [a] = seed();
    const before = JSON.stringify(store().inspections);
    await render(<Harness tyreId={a} s={scanner({ status: 'unavailable', reason: 'model_missing' })} />);
    await scan();
    expect(hook.treadWear).toEqual({ status: 'unavailable', reason: 'model_missing' });
    expect(JSON.stringify(store().inspections)).toBe(before);
  });

  test('a tyre without a result has nothing to save into', async () => {
    const [a] = seed({ withResult: false });
    await render(<Harness tyreId={a} s={scanner(done([{ frame: 't1.jpg', detections: [det('diagonal_wear', 0.4)] }]))} />);
    await scan();
    expect(hook.treadWear.status).toBe('done');
    expect(tyre(a).result).toBeNull();
  });

  test('a saved check is shown, and autoScan does not run the model again', async () => {
    const [a] = seed();
    const first = scanner(done([{ frame: 't1.jpg', detections: [det('flat_spot', 0.4)] }]));
    const view = await render(<Harness tyreId={a} s={first} autoScan />);
    await act(async () => {});
    expect(first.scan).toHaveBeenCalledTimes(1);
    await view.unmount();

    const second = scanner(done([]));
    await render(<Harness tyreId={a} s={second} autoScan />);
    await act(async () => {});
    expect(second.scan).not.toHaveBeenCalled();
    expect(hook.treadWear).toEqual({
      status: 'saved',
      record: expect.objectContaining({ title: 'Flat Spot', severity: 'detected' }),
    });
  });

  test('a check of frames the tyre no longer has is not saved', async () => {
    const [a] = seed();
    let finish!: (o: TreadWearScanOutcome) => void;
    await render(<Harness tyreId={a} s={{ scan: () => new Promise(r => (finish = r)) }} />);
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook.scanTreadWear();
    });
    // Tread scanned again meanwhile: new frames, result kept for this test.
    await act(async () => {
      store().updateTyre(a, { treadFrames: ['t3.jpg'] });
    });
    await act(async () => {
      finish(done([{ frame: 't1.jpg', detections: [det('center_wear', 0.9)] }]));
      await pending;
    });
    expect(tyre(a).result!.treadWear).toBeUndefined();
    expect(tyre(a).result!.wearPattern).toBeNull();
  });

  test('switching tyre resets the wear state and drops a scan still running', async () => {
    const [a, b] = seed();
    let finish!: (o: TreadWearScanOutcome) => void;
    let cancelled: (() => boolean) | undefined;
    const slow: TreadWearScanner = {
      scan: (_frames, isCancelled) => {
        cancelled = isCancelled;
        return new Promise(r => (finish = r));
      },
    };
    const view = await render(<Harness tyreId={a} s={slow} />);
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook.scanTreadWear();
    });
    expect(hook.treadWear).toEqual({ status: 'scanning' });

    await view.rerender(<Harness tyreId={b} s={slow} />);
    expect(cancelled!()).toBe(true);
    await act(async () => {
      finish(done([{ frame: 't1.jpg', detections: [det('center_wear', 0.9)] }]));
      await pending;
    });
    expect(hook.treadWear).toEqual({ status: 'idle' });
    expect(hook.tyre!.id).toBe(b);
  });
});
