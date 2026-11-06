import { describeTreadWear, TREAD_WEAR_SEVERITY } from '../../ml/config/treadWearConfig';
import type { TreadWearRecord, TreadWearSeverity, TyreResult } from './types';

// Builds the saved tread wear record, and the wording shown for it on Tyre
// result, the report screen and the PDF. One place, so they can't disagree.

export const NORMAL_WEAR_TITLE = 'Normal Wear Distribution';

export const WEAR_SEVERITY_LABELS: Record<TreadWearSeverity, string> = {
  none: NORMAL_WEAR_TITLE,
  detected: 'Wear pattern found',
  critical: 'Maintenance needed',
};

/** One wear class across all frames read. */
export type WearFinding = { label: string; maxConfidence: number };

export function treadWearSeverity(
  findings: WearFinding[],
  criticalMinConfidence: number = TREAD_WEAR_SEVERITY.criticalMinConfidence,
): TreadWearSeverity {
  if (findings.length === 0) return 'none';
  return findings.some(f => f.maxConfidence >= criticalMinConfidence) ? 'critical' : 'detected';
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Findings (strongest first) → the record saved with the tyre result. */
export function buildTreadWearRecord(
  findings: WearFinding[],
  modelVersion: string,
  now: Date = new Date(),
): TreadWearRecord {
  const severity = treadWearSeverity(findings);
  const base = { severity, modelVersion, checkedAt: now.toISOString() };
  const [top, ...rest] = findings;
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

/** Tyre result with the wear record saved. Only wear fields change; never the status. */
export function withTreadWear(result: TyreResult, record: TreadWearRecord): TyreResult {
  return { ...result, wearPattern: record.title, treadWear: record };
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
    const pattern =
      record.severity === 'none'
        ? `Wear: ${record.title}`
        : `Wear: ${record.title} · ${WEAR_SEVERITY_LABELS[record.severity]}`;
    return { pattern, recommendation: record.recommendation };
  }
  return result.wearPattern ? { pattern: `Wear: ${result.wearPattern}`, recommendation: null } : null;
}
