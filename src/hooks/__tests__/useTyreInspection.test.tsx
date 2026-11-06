import React from 'react';
import { act, render } from '@testing-library/react-native';
import { useInspectionStore } from '../../features/inspection/store';
import type { TreadWearClass } from '../../ml/config/treadWearConfig';
import type { TreadWearScanOutcome, TreadWearScanner } from '../../ml/services/TreadWearDetector';
import {
  clearTreadWearCache,
  summariseTreadWear,
  treadWearSeverity,
  useTyreInspection,
} from '../useTyreInspection';

const store = () => useInspectionStore.getState();

function det(label: TreadWearClass, confidence: number) {
  return { label, confidence, bbox: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number], frameRect: null };
}

function done(frames: { frame: string; detections: ReturnType<typeof det>[] }[]): TreadWearScanOutcome {
  return { status: 'done', frames, framesFailed: 0, delegate: 'cpu' };
}

const scanner = (outcome: TreadWearScanOutcome): TreadWearScanner & { scan: jest.Mock } => ({
  scan: jest.fn(async () => outcome),
});

/** One inspection with two tyres; the first has saved tread frames and sidewall details. */
function seed(): [string, string] {
  store().replaceAll([], null);
  store().startInspection('test');
  store().selectTyres(['Left front', 'Right front']);
  const [a, b] = store().inspections[0].tyres;
  store().setSidewallCaptured(a.id, ['s1.jpg'], { size: '215/65 R15', dotTin: null, make: 'Michelin', model: null });
  store().setTreadCaptured(a.id, ['t1.jpg', 't2.jpg']);
  return [a.id, b.id];
}

let hook: ReturnType<typeof useTyreInspection>;
function Harness({ tyreId, s }: { tyreId: string; s: TreadWearScanner }) {
  hook = useTyreInspection(tyreId, { treadWearScanner: s });
  return null;
}

describe('severity and summary', () => {
  test('one finding per class: highest confidence, frames counted once each', () => {
    const findings = summariseTreadWear([
      { frame: 'a', detections: [det('Center Wear', 0.4), det('Center Wear', 0.5), det('Feather Edge', 0.3)] },
      { frame: 'b', detections: [det('Center Wear', 0.7)] },
    ]);
    expect(findings).toEqual([
      { label: 'Center Wear', maxConfidence: 0.7, frames: 2 },
      { label: 'Feather Edge', maxConfidence: 0.3, frames: 1 },
    ]);
  });

  test('critical at 0.60 and above, detected below, none without findings', () => {
    expect(treadWearSeverity([])).toBe('none');
    expect(treadWearSeverity([{ label: 'Spotty Wear', maxConfidence: 0.599, frames: 1 }])).toBe('detected');
    expect(treadWearSeverity([{ label: 'Spotty Wear', maxConfidence: 0.6, frames: 1 }])).toBe('critical');
  });
});

describe('useTyreInspection', () => {
  beforeEach(() => clearTreadWearCache());

  test('scans the tyre’s saved tread frames and reports wear without touching the store', async () => {
    const [a] = seed();
    const before = JSON.stringify(store().inspections);
    const s = scanner(done([{ frame: 't1.jpg', detections: [det('Center Wear', 0.65), det('Wavy Wear', 0.3)] }]));
    await render(<Harness tyreId={a} s={s} />);

    expect(hook.treadWear).toEqual({ status: 'idle' });
    expect(hook.sidewallDetails).toEqual(expect.objectContaining({ size: '215/65 R15', make: 'Michelin' }));

    await act(async () => {
      await hook.scanTreadWear();
    });
    expect(s.scan).toHaveBeenCalledWith(['t1.jpg', 't2.jpg'], expect.any(Function));
    expect(hook.treadWear).toEqual(
      expect.objectContaining({ status: 'done', severity: 'critical', wearPattern: 'Center Wear', framesFailed: 0 }),
    );
    // Status, result and sidewall details are untouched.
    expect(JSON.stringify(store().inspections)).toBe(before);
    expect(hook.tyre!.result).toBeNull();
  });

  test('no wear found: severity none and no wear pattern', async () => {
    const [a] = seed();
    await render(<Harness tyreId={a} s={scanner(done([{ frame: 't1.jpg', detections: [] }]))} />);
    await act(async () => {
      await hook.scanTreadWear();
    });
    expect(hook.treadWear).toEqual(expect.objectContaining({ status: 'done', severity: 'none', wearPattern: null }));
  });

  test('model missing is reported as unavailable, never as a result', async () => {
    const [a] = seed();
    await render(<Harness tyreId={a} s={scanner({ status: 'unavailable', reason: 'model_missing' })} />);
    await act(async () => {
      await hook.scanTreadWear();
    });
    expect(hook.treadWear).toEqual({ status: 'unavailable', reason: 'model_missing' });
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
      finish(done([{ frame: 't1.jpg', detections: [det('Center Wear', 0.9)] }]));
      await pending;
    });
    expect(hook.treadWear).toEqual({ status: 'idle' });
    expect(hook.tyre!.id).toBe(b);
  });
});
