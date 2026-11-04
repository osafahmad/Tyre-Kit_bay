import { inspectionStatus } from '../inspection/status';
import type { Inspection, TyreStatus } from '../inspection/types';

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

/** Summary line for the report, from the worst real result (spec §4.21). */
export function reportSummary(inspection: Inspection): ReportSummary {
  const analysed = inspection.tyres.filter(t => t.state === 'done' && t.result);
  const notScanned = inspection.tyres.length - analysed.length;
  const withStatus = (s: TyreStatus) =>
    analysed.filter(t => t.result?.status === s).map(t => t.position);

  const now = withStatus('replace_now');
  const soon = withStatus('replace_soon');
  const notScannedLine =
    notScanned === 0
      ? null
      : notScanned === 1
        ? "1 tyre wasn't scanned."
        : `${notScanned} tyres weren't scanned.`;
  const join = (...lines: (string | null)[]) => lines.filter(Boolean).join(' ') || null;

  const status = inspectionStatus(inspection.tyres);
  if (status === null) {
    return { status: null, headline: 'No tyres were analysed', detail: notScannedLine };
  }
  if (status === 'replace_now') {
    return {
      status,
      headline: `${joinPositions(now)} ${now.length === 1 ? 'needs' : 'need'} replacing now`,
      detail: join(
        soon.length ? `${joinPositions(soon)} should be replaced soon.` : null,
        notScannedLine,
      ),
    };
  }
  if (status === 'replace_soon') {
    return {
      status,
      headline: `${joinPositions(soon)} should be replaced soon.`,
      detail: notScannedLine,
    };
  }
  return {
    status,
    headline: 'All scanned tyres are in good condition',
    detail: notScannedLine,
  };
}
