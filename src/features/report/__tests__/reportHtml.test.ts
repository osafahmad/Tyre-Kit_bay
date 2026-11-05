import {
  AUTOMATED_CHECK_NOTICE,
  DEMO_DATA_NOTICE,
  escapeHtml,
  reportFileName,
  reportHtml,
} from '../reportHtml';
import type { Inspection, TyreInspection, TyreResult } from '../../inspection/types';
import { emptySidewallDetails } from '../../inspection/store';

const result = (over: Partial<TyreResult>): TyreResult => ({
  status: 'good',
  treadDepthMm: 6.2,
  treadConfidence: null,
  wearPattern: null,
  damageFound: null,
  damageConfidence: null,
  size: '215/65 R15',
  rimInches: 15,
  make: null,
  model: null,
  dotTin: null,
  ageYears: null,
  ageMonths: null,
  ...over,
});

const tyre = (position: string, over: Partial<TyreInspection>): TyreInspection => ({
  id: position,
  position,
  state: 'waiting',
  sidewallFrames: [],
  treadFrames: [],
  result: null,
  errorReason: null,
  sidewallDetails: emptySidewallDetails,
  ...over,
});

const base = (over: Partial<Inspection> = {}): Inspection => ({
  id: 'i',
  createdAt: new Date(2026, 10, 4, 11, 40).toISOString(),
  completedAt: null,
  plate: 'ABC-1234',
  chassis: 'JT2BG22K0W0123456',
  tyres: [
    tyre('Left front', { state: 'done', result: result({}) }),
    tyre('Right front', { state: 'done', result: result({ status: 'replace_now', treadDepthMm: null }) }),
    tyre('Left rear', { state: 'pending_analysis', treadFrames: ['t.jpg'] }),
    tyre('Right rear', { state: 'skipped' }),
  ],
  reportPath: null,
  analyzerVersion: 'demo-1',
  ...over,
});

test('escapes user-entered text', () => {
  expect(escapeHtml(`<b>"A&B's"</b>`)).toBe('&lt;b&gt;&quot;A&amp;B&#39;s&quot;&lt;/b&gt;');
  const html = reportHtml(base({ plate: '<script>x</script>' }), { demo: false });
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
});

test('has vehicle, date, summary, every tyre and the automated-check footer', () => {
  const html = reportHtml(base(), { demo: false });
  expect(html).toContain('ABC-1234 · 4 Nov 2026, 11:40');
  expect(html).toContain('JT2BG22K0W0123456');
  expect(html).toContain('Right front needs replacing now');
  expect(html).toContain('6.2 mm · 215/65 R15');
  expect(html).toContain('Replace now');
  expect(html).toContain('Analysis pending');
  expect(html).toContain('1 frame saved');
  expect(html).toContain('Not scanned');
  expect(html).toContain(AUTOMATED_CHECK_NOTICE);
  expect(html).not.toContain(DEMO_DATA_NOTICE);
});

test('null tread depth shows no mm value for that tyre', () => {
  const html = reportHtml(
    base({ tyres: [tyre('Front', { state: 'done', result: result({ treadDepthMm: null }) })] }),
    { demo: false },
  );
  expect(html).not.toMatch(/\d mm/);
});

test('demo results carry the Demo data notice', () => {
  expect(reportHtml(base(), { demo: true })).toContain(DEMO_DATA_NOTICE);
});

test('no plate and no chassis', () => {
  const html = reportHtml(base({ plate: null, chassis: null }), { demo: false });
  expect(html).toContain('No plate · ');
  expect(html).not.toContain('class="chassis"');
});

test('self-contained: nothing is loaded from the network', () => {
  expect(reportHtml(base(), { demo: true })).not.toMatch(/https?:\/\//);
});

test('file name has the date and time but not the plate', () => {
  const name = reportFileName(base());
  expect(name).toBe('tyre-report-20261104-1140');
  expect(name).not.toContain('ABC');
});
