import { useCallback, useEffect, useRef, useState } from 'react';
import { useTyre } from '../features/inspection/store';
import { TREAD_WEAR_SEVERITY, type TreadWearClass } from '../ml/config/treadWearConfig';
import {
  getTreadWearDetector,
  type TreadWearFrameResult,
  type TreadWearScanner,
  type TreadWearUnavailableReason,
} from '../ml/services/TreadWearDetector';

// One tyre's inspection data for a screen: the saved tyre and its confirmed
// sidewall details (from the store, untouched), plus tread wear detections.
// Wear detections live only in this hook's state: they're never written to
// the store or the database, and they never change the tyre's status.

/**
 * - `none`: the model ran and found no wear pattern.
 * - `detected`: a wear pattern below the critical confidence.
 * - `critical`: a wear pattern at or above `TREAD_WEAR_SEVERITY.criticalMinConfidence`.
 * An indicator only. It's never Good / Replace soon / Replace now.
 */
export type TreadWearSeverity = 'none' | 'detected' | 'critical';

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
  | {
      status: 'done';
      /** Strongest first. */
      findings: TreadWearFinding[];
      severity: TreadWearSeverity;
      /** Strongest wear class, for `TyreResult.wearPattern`; null if none was found. */
      wearPattern: TreadWearClass | null;
      frames: TreadWearFrameResult[];
      framesFailed: number;
    };

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

export function treadWearSeverity(
  findings: TreadWearFinding[],
  criticalMinConfidence: number = TREAD_WEAR_SEVERITY.criticalMinConfidence,
): TreadWearSeverity {
  if (findings.length === 0) return 'none';
  return findings.some(f => f.maxConfidence >= criticalMinConfidence) ? 'critical' : 'detected';
}

export type UseTyreInspectionOptions = {
  /** Injected in tests. Defaults to the app's tread wear detector. */
  treadWearScanner?: TreadWearScanner;
  /** Scan the saved tread frames as soon as the tyre is shown (Tyre result). */
  autoScan?: boolean;
};

type DoneState = Extract<TreadWearState, { status: 'done' }>;

/**
 * Finished scans for this app session, so reopening a tyre doesn't run the
 * model again over the same frames. Memory only, never saved. Keyed by tyre
 * and its frame list, so a rescan of the tyre (new frames) misses the cache.
 */
const scanCache = new Map<string, DoneState>();
const SCAN_CACHE_LIMIT = 24;
const cacheKey = (tyreId: string, frames: string[]) => `${tyreId}|${frames.join('|')}`;

/** For tests. */
export function clearTreadWearCache(): void {
  scanCache.clear();
}

export function useTyreInspection(tyreId: string, options: UseTyreInspectionOptions = {}) {
  const found = useTyre(tyreId);
  const [treadWear, setTreadWear] = useState<TreadWearState>({ status: 'idle' });
  // Bumped on every new scan, tyre change and unmount; a stale scan's result is dropped.
  const runId = useRef(0);
  const scannerRef = useRef(options.treadWearScanner);
  scannerRef.current = options.treadWearScanner;
  const treadFrames = found?.tyre.treadFrames;
  const framesRef = useRef(treadFrames);
  framesRef.current = treadFrames;

  useEffect(() => {
    const cached = scanCache.get(cacheKey(tyreId, framesRef.current ?? []));
    setTreadWear(cached ?? { status: 'idle' });
    // The counter object itself, not a DOM node: bumping it at cleanup cancels any running scan.
    const runs = runId;
    return () => {
      runs.current++;
    };
  }, [tyreId]);

  /** Runs the wear model on this tyre's saved tread frames. Call after tread capture only. */
  const scanTreadWear = useCallback(async (): Promise<TreadWearState> => {
    const run = ++runId.current;
    const isCancelled = () => run !== runId.current;
    const frames = framesRef.current ?? [];
    const key = cacheKey(tyreId, frames);
    const cached = scanCache.get(key);
    if (cached) {
      setTreadWear(cached);
      return cached;
    }
    setTreadWear({ status: 'scanning' });
    const scanner = scannerRef.current ?? getTreadWearDetector();
    let next: TreadWearState;
    try {
      const outcome = await scanner.scan(frames, isCancelled);
      if (outcome.status === 'cancelled') return { status: 'idle' };
      if (outcome.status === 'unavailable') {
        next = { status: 'unavailable', reason: outcome.reason };
      } else {
        const findings = summariseTreadWear(outcome.frames);
        next = {
          status: 'done',
          findings,
          severity: treadWearSeverity(findings),
          wearPattern: findings[0]?.label ?? null,
          frames: outcome.frames,
          framesFailed: outcome.framesFailed,
        };
        if (scanCache.size >= SCAN_CACHE_LIMIT) scanCache.delete(scanCache.keys().next().value!);
        scanCache.set(key, next);
      }
    } catch {
      // The scanner doesn't throw; if it ever does, report no model rather than a made-up result.
      next = { status: 'unavailable', reason: 'model_missing' };
    }
    if (!isCancelled()) setTreadWear(next);
    return next;
  }, [tyreId]);

  const autoScan = options.autoScan ?? false;
  const framesKey = (treadFrames ?? []).join('|');
  useEffect(() => {
    if (autoScan) scanTreadWear();
  }, [autoScan, framesKey, scanTreadWear]);

  const resetTreadWear = useCallback(() => {
    runId.current++;
    setTreadWear({ status: 'idle' });
  }, []);

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
