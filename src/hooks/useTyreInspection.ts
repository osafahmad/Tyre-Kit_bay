import { useCallback, useEffect, useRef, useState } from 'react';
import { useInspectionStore, useTyre } from '../features/inspection/store';
import { buildTreadWearRecord } from '../features/inspection/treadWear';
import type { TreadWearRecord } from '../features/inspection/types';
import type { TreadWearClass } from '../ml/config/treadWearConfig';
import {
  getTreadWearDetector,
  type TreadWearFrameResult,
  type TreadWearScanner,
  type TreadWearUnavailableReason,
} from '../ml/services/TreadWearDetector';

// One tyre's inspection data for a screen: the saved tyre and its confirmed
// sidewall details (from the store, untouched), plus the tread wear check.
// A finished check is saved into the tyre's result (wear pattern and the
// `treadWear` record only); it never changes the tyre's status.

export { treadWearSeverity } from '../features/inspection/treadWear';
export type { TreadWearSeverity } from '../features/inspection/types';

/** One wear class across all frames read. */
export type TreadWearFinding = {
  label: TreadWearClass;
  /** Highest confidence of this class in any frame. */
  maxConfidence: number;
  /** Frames this class was found in. */
  frames: number;
};

export type TreadWearState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'unavailable'; reason: TreadWearUnavailableReason }
  /** Checked just now, and saved. */
  | {
      status: 'done';
      record: TreadWearRecord;
      /** Strongest first. */
      findings: TreadWearFinding[];
      frames: TreadWearFrameResult[];
      framesFailed: number;
    }
  /** Checked earlier: the record saved with the tyre result. */
  | { status: 'saved'; record: TreadWearRecord };

/** Per-frame detections → one finding per wear class, strongest first. */
export function summariseTreadWear(frames: TreadWearFrameResult[]): TreadWearFinding[] {
  const byLabel = new Map<TreadWearClass, TreadWearFinding>();
  for (const f of frames) {
    const seen = new Set<TreadWearClass>();
    for (const d of f.detections) {
      const cur = byLabel.get(d.label) ?? { label: d.label, maxConfidence: 0, frames: 0 };
      cur.maxConfidence = Math.max(cur.maxConfidence, d.confidence);
      if (!seen.has(d.label)) {
        cur.frames++;
        seen.add(d.label);
      }
      byLabel.set(d.label, cur);
    }
  }
  return [...byLabel.values()].sort((a, b) => b.maxConfidence - a.maxConfidence);
}

export type UseTyreInspectionOptions = {
  /** Injected in tests. Defaults to the app's tread wear detector. */
  treadWearScanner?: TreadWearScanner;
  /**
   * Check the saved tread frames as soon as the tyre is shown (Tyre result),
   * unless the result already has a saved wear check.
   */
  autoScan?: boolean;
};

export function useTyreInspection(tyreId: string, options: UseTyreInspectionOptions = {}) {
  const found = useTyre(tyreId);
  const [local, setLocal] = useState<TreadWearState>({ status: 'idle' });
  // Bumped on every new scan, tyre change and unmount; a stale scan's state is dropped.
  const runId = useRef(0);
  const scannerRef = useRef(options.treadWearScanner);
  scannerRef.current = options.treadWearScanner;
  const treadFrames = found?.tyre.treadFrames;
  const framesRef = useRef(treadFrames);
  framesRef.current = treadFrames;
  const saved = found?.tyre.result?.treadWear ?? null;

  useEffect(() => {
    setLocal({ status: 'idle' });
    // The counter object itself, not a DOM node: bumping it at cleanup cancels any running scan.
    const runs = runId;
    return () => {
      runs.current++;
    };
  }, [tyreId]);

  /**
   * Runs the wear model on this tyre's saved tread frames (after capture
   * only) and saves the check into the tyre's result. Status is never changed.
   */
  const scanTreadWear = useCallback(async (): Promise<TreadWearState> => {
    const run = ++runId.current;
    const isCancelled = () => run !== runId.current;
    const frames = framesRef.current ?? [];
    setLocal({ status: 'scanning' });
    const scanner = scannerRef.current ?? getTreadWearDetector();
    let next: TreadWearState;
    try {
      const outcome = await scanner.scan(frames, isCancelled);
      if (outcome.status === 'cancelled') return { status: 'idle' };
      if (outcome.status === 'unavailable') {
        // Nothing was checked: nothing is saved, and the Wear pattern row is left as it was.
        next = { status: 'unavailable', reason: outcome.reason };
      } else {
        const findings = summariseTreadWear(outcome.frames);
        const record = buildTreadWearRecord(findings, outcome.modelVersion);
        // Saved even if the screen has moved on: the store checks the frames still match.
        useInspectionStore.getState().setTreadWear(tyreId, record, frames);
        next = { status: 'done', record, findings, frames: outcome.frames, framesFailed: outcome.framesFailed };
      }
    } catch {
      // The scanner doesn't throw; if it ever does, report no model rather than a made-up result.
      next = { status: 'unavailable', reason: 'model_missing' };
    }
    if (!isCancelled()) setLocal(next);
    return next;
  }, [tyreId]);

  const autoScan = options.autoScan ?? false;
  const framesKey = (treadFrames ?? []).join('|');
  const hasSaved = saved !== null;
  useEffect(() => {
    if (autoScan && !hasSaved) scanTreadWear();
  }, [autoScan, framesKey, hasSaved, scanTreadWear]);

  const resetTreadWear = useCallback(() => {
    runId.current++;
    setLocal({ status: 'idle' });
  }, []);

  const treadWear: TreadWearState = local.status === 'idle' && saved ? { status: 'saved', record: saved } : local;

  return {
    inspection: found?.inspection ?? null,
    tyre: found?.tyre ?? null,
    /** Confirmed sidewall OCR values, straight from the store. */
    sidewallDetails: found?.tyre.sidewallDetails ?? null,
    treadWear,
    scanTreadWear,
    resetTreadWear,
  };
}
