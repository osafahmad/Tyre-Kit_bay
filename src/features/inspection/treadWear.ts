import {
  describeTreadWear,
  isTreadWearClass,
  NO_DEFECT_CLASS,
  TREAD_WEAR_CONSENSUS,
  TREAD_WEAR_SEVERITY,
  TREAD_WEAR_STATUS_RULES,
} from '../../ml/config/treadWearConfig';
import { diagnosticsConfig } from '../../config/diagnostics';
import type { TreadWearRecord, TreadWearSeverity, TyreResult, TyreStatus } from './types';

// Builds the saved tread wear record, and the wording shown for it on Tyre
// result, the report screen and the PDF. One place, so they can't disagree.

/** Shown when no defect class passed the threshold (owner wording 2026-11-11; was `Normal Wear Distribution`). */
export const NORMAL_WEAR_TITLE = 'No Abnormal Wear Pattern Detected';

/** Staging guard: shown with every wear finding while the model is unverified. */
export const WEAR_UNVERIFIED_NOTE = 'Beta / Model Unverified';

/** The note for a record that shows a finding, or null (nothing found, or the guard is off). */
export function wearUnverifiedNote(
  record: Pick<TreadWearRecord, 'severity'> | null | undefined,
  enabled: boolean = diagnosticsConfig.treadWearModelUnverified,
): string | null {
  return enabled && record && record.severity !== 'none' ? WEAR_UNVERIFIED_NOTE : null;
}

export const WEAR_SEVERITY_LABELS: Record<TreadWearSeverity, string> = {
  none: NORMAL_WEAR_TITLE,
  detected: 'Wear pattern found',
  critical: 'Maintenance needed',
};

/** One wear class across all frames read. */
export type WearFinding = {
  label: string;
  maxConfidence: number;
  /** Frames where this class scored at or above `TREAD_WEAR_CONSENSUS.minConfidence`. Missing counts as 0. */
  consensusFrames?: number;
};

/** Enough frames agree, strongly enough, for this finding to escalate (`TREAD_WEAR_CONSENSUS`). */
export function hasConsensus(f: WearFinding): boolean {
  return (f.consensusFrames ?? 0) >= TREAD_WEAR_CONSENSUS.minFrames;
}

const STATUS_RANK: Record<TyreStatus, number> = { good: 0, replace_soon: 1, replace_now: 2 };

/** The worse of two statuses; null means no change. */
export function worseStatus(a: TyreStatus, b: TyreStatus | null | undefined): TyreStatus {
  return b && STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

/** `normal_even_wear` (even wear, owner decision 2026-11-10) is never a defect finding. */
export function isDefectFinding(f: WearFinding): boolean {
  return f.label !== NO_DEFECT_CLASS;
}

/**
 * The lowest status a finding forces (`TREAD_WEAR_STATUS_RULES`), or null.
 * Every finding already passed the model's confidence threshold. Without
 * cross-frame consensus a finding never changes the status.
 */
export function findingMinimumStatus(f: WearFinding): TyreStatus | null {
  if (!isTreadWearClass(f.label) || !hasConsensus(f)) return null;
  const rule = TREAD_WEAR_STATUS_RULES[f.label];
  if (!rule) return null;
  return rule.minConfidence === null || f.maxConfidence >= rule.minConfidence ? rule.minStatus : null;
}

/** The finding that forces the worst status (strongest first on ties), or null. */
function statusRaisingFinding(findings: WearFinding[]): { finding: WearFinding; status: TyreStatus } | null {
  let best: { finding: WearFinding; status: TyreStatus } | null = null;
  for (const finding of findings) {
    const status = findingMinimumStatus(finding);
    if (status && (!best || STATUS_RANK[status] > STATUS_RANK[best.status])) best = { finding, status };
  }
  return best;
}

export function treadWearSeverity(
  findings: WearFinding[],
  criticalMinConfidence: number = TREAD_WEAR_SEVERITY.criticalMinConfidence,
): TreadWearSeverity {
  const defects = findings.filter(isDefectFinding);
  if (defects.length === 0) return 'none';
  if (statusRaisingFinding(defects)) return 'critical';
  return defects.some(f => hasConsensus(f) && f.maxConfidence >= criticalMinConfidence) ? 'critical' : 'detected';
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Findings (strongest first) → the record saved with the tyre result.
 * `normal_even_wear` is dropped. A finding that raises the status is shown
 * first, ahead of stronger wear patterns, so the title explains the status.
 */
export function buildTreadWearRecord(
  findings: WearFinding[],
  modelVersion: string,
  now: Date = new Date(),
): TreadWearRecord {
  const defects = findings.filter(isDefectFinding);
  const severity = treadWearSeverity(defects);
  const raising = statusRaisingFinding(defects);
  const base = {
    severity,
    minimumStatus: raising?.status ?? null,
    modelVersion,
    checkedAt: now.toISOString(),
  };
  const ordered = raising ? [raising.finding, ...defects.filter(f => f !== raising.finding)] : defects;
  const [top, ...rest] = ordered;
  if (!top) {
    return { ...base, label: null, title: NORMAL_WEAR_TITLE, cause: null, recommendation: null, confidence: null, alsoSeen: [] };
  }
  const shown = describeTreadWear(top.label);
  const recommendation =
    severity === 'critical'
      ? shown.severityHint
        ? `Get this checked as soon as possible: ${lowerFirst(shown.severityHint)}.`
        : 'Get this checked as soon as possible.'
      : shown.severityHint;
  const alsoSeen = [...new Set(rest.map(f => describeTreadWear(f.label).title))].filter(t => t !== shown.title);
  return {
    ...base,
    label: top.label,
    title: shown.title,
    cause: shown.cause,
    recommendation,
    confidence: top.maxConfidence,
    alsoSeen,
  };
}

/**
 * Tyre result with the wear record saved. The status is only ever raised, to
 * the record's `minimumStatus` (owner decision 2026-11-10); never lowered.
 */
export function withTreadWear(result: TyreResult, record: TreadWearRecord): TyreResult {
  return {
    ...result,
    status: worseStatus(result.status, record.minimumStatus),
    wearPattern: record.title,
    treadWear: record,
  };
}

/**
 * Report lines for one tyre: "Wear: Center Tread Wear · Maintenance needed"
 * and the recommendation. Uses the analyzer's wear pattern when the wear
 * model hasn't run. Null when there's nothing to show.
 */
export function wearReportLines(
  result: TyreResult,
): { pattern: string; recommendation: string | null } | null {
  const record = result.treadWear;
  if (record) {
    const note = wearUnverifiedNote(record);
    const pattern =
      record.severity === 'none'
        ? `Wear: ${record.title}`
        : `Wear: ${record.title} · ${WEAR_SEVERITY_LABELS[record.severity]}${note ? ` (${note})` : ''}`;
    return { pattern, recommendation: record.recommendation };
  }
  return result.wearPattern ? { pattern: `Wear: ${result.wearPattern}`, recommendation: null } : null;
}
