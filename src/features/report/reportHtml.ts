import { colors, statusColors } from '../../theme/colors';
import { formatLongDateTime } from '../inspection/format';
import type { Inspection, TyreStatus } from '../inspection/types';
import { reportSummary, reportTyreRows } from './summary';

export const AUTOMATED_CHECK_NOTICE =
  "Automated check. It doesn't replace a professional inspection.";

export const DEMO_DATA_NOTICE =
  'Demo data. These results are not from a real analysis and must not be used to judge the tyres.';

const STATUS_LABELS: Record<TyreStatus, string> = {
  good: 'Good',
  replace_soon: 'Replace soon',
  replace_now: 'Replace now',
};

/** Every value from the inspection is escaped: plates and sizes are typed by users. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badge(status: TyreStatus): string {
  const c = statusColors[status];
  return `<span class="badge" style="background:${c.background};color:${c.text}">${STATUS_LABELS[status]}</span>`;
}

/**
 * HTML for the shared PDF (spec §4.21). Self-contained: no remote fonts,
 * images or scripts, so building it never touches the network.
 */
export function reportHtml(inspection: Inspection, options: { demo: boolean }): string {
  const summary = reportSummary(inspection);
  const rows = reportTyreRows(inspection);
  const summaryColors = summary.status
    ? statusColors[summary.status]
    : { background: colors.surfaceMuted, text: colors.black };
  const meta = `${inspection.plate ?? 'No plate'} · ${formatLongDateTime(
    new Date(inspection.createdAt),
  )}`;

  const rowHtml = rows
    .map(r => {
      const right = r.status
        ? badge(r.status)
        : `<span class="label">${escapeHtml(r.label ?? '')}</span>`;
      const detail = r.detail ? `<div class="detail">${escapeHtml(r.detail)}</div>` : '';
      const wear = r.wear ? `<div class="wear">${escapeHtml(r.wear)}</div>` : '';
      const advice = r.wearRecommendation
        ? `<div class="advice">${escapeHtml(r.wearRecommendation)}</div>`
        : '';
      return `<tr><td><div class="position">${escapeHtml(r.position)}</div>${detail}${wear}${advice}</td><td class="right">${right}</td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tyre report</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: -apple-system, 'Helvetica Neue', Roboto, Arial, sans-serif; color: ${colors.black}; background: ${colors.white}; font-size: 14px; }
  header { background: ${colors.black}; color: ${colors.white}; padding: 24px; border-radius: 12px; }
  .meta { color: ${colors.textOnDark}; font-size: 13px; }
  h1 { margin: 4px 0 0; font-size: 26px; }
  .chassis { margin-top: 6px; color: ${colors.textOnDark}; font-family: Menlo, 'Courier New', monospace; font-size: 13px; }
  .demo { margin-top: 16px; padding: 10px 12px; border: 1px solid ${colors.inputBorder}; border-radius: 12px; background: ${colors.surfaceMuted}; font-weight: 600; }
  .summary { margin-top: 16px; padding: 14px 16px; border-radius: 12px; }
  .summary strong { display: block; font-size: 15px; }
  .advisory { font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 12px 0; border-bottom: 1px solid ${colors.border}; vertical-align: middle; }
  .position { font-weight: 600; font-size: 15px; }
  .detail { color: ${colors.textSecondary}; font-size: 13px; margin-top: 3px; }
  .wear { color: ${colors.black}; font-size: 13px; margin-top: 3px; }
  .advice { color: ${colors.navy}; font-size: 13px; font-weight: 600; margin-top: 2px; }
  .right { text-align: right; white-space: nowrap; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-weight: 600; font-size: 12px; }
  .label { color: ${colors.textSecondary}; font-size: 13px; }
  footer { margin-top: 24px; color: ${colors.textSecondary}; font-size: 12px; }
</style>
</head>
<body>
<header>
  <div class="meta">${escapeHtml(meta)}</div>
  <h1>Tyre report</h1>
  ${inspection.chassis ? `<div class="chassis">${escapeHtml(inspection.chassis)}</div>` : ''}
</header>
${options.demo ? `<div class="demo">${DEMO_DATA_NOTICE}</div>` : ''}
<div class="summary" style="background:${summaryColors.background};color:${summaryColors.text}">
  <strong>${escapeHtml(summary.headline)}</strong>
  ${summary.advisory ? `<div class="advisory">${escapeHtml(summary.advisory)}</div>` : ''}
  ${summary.detail ? `<div>${escapeHtml(summary.detail)}</div>` : ''}
</div>
<table>${rowHtml}</table>
<footer>${AUTOMATED_CHECK_NOTICE}</footer>
</body>
</html>`;
}

/** "tyre-report-20261104-1140". No plate in the name: it may be shown to other apps. */
export function reportFileName(inspection: Inspection): string {
  const d = new Date(inspection.createdAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `tyre-report-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}`;
}
