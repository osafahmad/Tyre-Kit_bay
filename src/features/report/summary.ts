import { inspectionStatus } from '../inspection/status';
import type { Inspection, TyreStatus } from '../inspection/types';
import { tyreDetailLine } from '../inspection/format';
import { wearReportLines } from '../inspection/treadWear';

export type ReportSummary = {
  status: TyreStatus | null;
  headline: string;
  detail: string | null;
};

/** "Right rear", "Right rear and left rear", "Left front, right front and right rear". */
export function joinPositions(positions: string[]): string {
  const [first, ...rest] = positions;
  const all = [first, ...rest.map(p => p.charAt(0).toLowerCase() + p.slice(1))];
  if (all.length <= 1) return all[0] ?? '';
  return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
}

export const ANALYSIS_PENDING_LABEL = 'Analysis pending';

const tyreCountSentence = (n: number, one: string, many: string) =>
  n === 0 ? null : n === 1 ? `1 tyre ${one}` : `${n} tyres ${many}`;

/** Summary line for the report, from the worst real result (spec §4.21). */
export function reportSummary(inspection: Inspection): ReportSummary {
  const analysed = inspection.tyres.filter(t => t.state === 'done' && t.result);
  const pending = inspection.tyres.filter(t => t.state === 'pending_analysis');
  const notScanned = inspection.tyres.length - analysed.length - pending.length;
  const withStatus = (s: TyreStatus) =>
    analysed.filter(t => t.result?.status === s).map(t => t.position);

  const now = withStatus('replace_now');
  const soon = withStatus('replace_soon');
  const pendingLine = tyreCountSentence(
    pending.length,
    'is waiting for analysis.',
    'are waiting for analysis.',
  );
  const notScannedLine = tyreCountSentence(notScanned, "wasn't scanned.", "weren't scanned.");
  const join = (...lines: (string | null)[]) => lines.filter(Boolean).join(' ') || null;

  const status = inspectionStatus(inspection.tyres);
  if (status === null) {
    if (pending.length > 0) {
      // Frames were captured but there's no real result to summarise.
      return {
        status: null,
        headline: ANALYSIS_PENDING_LABEL,
        detail: join(pendingLine, notScannedLine),
      };
    }
    return { status: null, headline: 'No tyres were analysed', detail: notScannedLine };
  }
  if (status === 'replace_now') {
    return {
      status,
      headline: `${joinPositions(now)} ${now.length === 1 ? 'needs' : 'need'} replacing now`,
      detail: join(
        soon.length ? `${joinPositions(soon)} should be replaced soon.` : null,
        pendingLine,
        notScannedLine,
      ),
    };
  }
  if (status === 'replace_soon') {
    return {
      status,
      headline: `${joinPositions(soon)} should be replaced soon.`,
      detail: join(pendingLine, notScannedLine),
    };
  }
  return {
    status,
    headline: 'All scanned tyres are in good condition',
    detail: join(pendingLine, notScannedLine),
  };
}

export type ReportTyreRow = {
  tyreId: string;
  position: string;
  /** `result`: analysed. `pending`: frames saved, no result. `not_scanned`: no usable capture. */
  kind: 'result' | 'pending' | 'not_scanned';
  status: TyreStatus | null;
  /** "6.2 mm · 215/65 R15" for results; size and saved frames for pending tyres. */
  detail: string;
  /** Label for tyres without a status. */
  label: string | null;
  /** "Wear: Center Tread Wear · Maintenance needed", or null if no wear result. Results only. */
  wear: string | null;
  /** Maintenance recommendation for the wear found, or null. */
  wearRecommendation: string | null;
};

const framesSaved = (n: number) => (n === 1 ? '1 frame saved' : `${n} frames saved`);

/** One row per selected tyre, in scan order (spec §4.21). Shared by the screen and the PDF. */
export function reportTyreRows(inspection: Inspection): ReportTyreRow[] {
  return inspection.tyres.map(t => {
    if (t.state === 'done' && t.result) {
      const wear = wearReportLines(t.result);
      return {
        tyreId: t.id,
        position: t.position,
        kind: 'result',
        status: t.result.status,
        detail: tyreDetailLine(t.result),
        label: null,
        wear: wear?.pattern ?? null,
        wearRecommendation: wear?.recommendation ?? null,
      };
    }
    if (t.state === 'pending_analysis') {
      const frames = t.sidewallFrames.length + t.treadFrames.length;
      return {
        tyreId: t.id,
        position: t.position,
        kind: 'pending',
        status: null,
        // Size only if it was read or typed and confirmed; never estimated.
        detail: [t.sidewallDetails.size, framesSaved(frames)].filter(Boolean).join(' · '),
        label: ANALYSIS_PENDING_LABEL,
        wear: null,
        wearRecommendation: null,
      };
    }
    return {
      tyreId: t.id,
      position: t.position,
      kind: 'not_scanned',
      status: null,
      detail: '',
      label: 'Not scanned',
      wear: null,
      wearRecommendation: null,
    };
  });
}
