import { reportHtml } from '../../report/reportHtml';
import { CRITICAL_WEAR_ADVISORY, reportSummary, reportTyreRows } from '../../report/summary';
import { emptySidewallDetails } from '../store';
import { buildTreadWearRecord, wearReportLines, withTreadWear } from '../treadWear';
import type { Inspection, TyreInspection, TyreResult } from '../types';

const NOW = new Date('2026-11-06T12:00:00Z');

const result = (over: Partial<TyreResult> = {}): TyreResult => ({
  status: 'good',
  treadDepthMm: 6.2,
  treadConfidence: null,
  wearPattern: null,
  damageFound: null,
  damageConfidence: null,
  size: '215/65 R15',
  rimInches: 15,
  make: 'Bridgestone',
  model: 'Ecopia EP150',
  dotTin: '4B7K 2JX 2623',
  ageYears: 3,
  ageMonths: 4,
  ...over,
});

describe('buildTreadWearRecord', () => {
  test('nothing found: Normal Wear Distribution, nothing to recommend', () => {
    expect(buildTreadWearRecord([], 'v1', NOW)).toEqual({
      severity: 'none',
      label: null,
      title: 'Normal Wear Distribution',
      cause: null,
      recommendation: null,
      confidence: null,
      alsoSeen: [],
      modelVersion: 'v1',
      checkedAt: '2026-11-06T12:00:00.000Z',
    });
  });

  test('below 0.60: the class advice as the recommendation', () => {
    expect(buildTreadWearRecord([{ label: 'Feather Edge', maxConfidence: 0.5 }], 'v1', NOW)).toEqual(
      expect.objectContaining({
        severity: 'detected',
        label: 'Feather Edge',
        title: 'Feathered Wear',
        cause: 'Toe alignment fault',
        recommendation: 'Perform wheel alignment',
        confidence: 0.5,
      }),
    );
  });

  test('0.60 and above: urgent recommendation', () => {
    expect(buildTreadWearRecord([{ label: 'Diagonal Wear', maxConfidence: 0.6 }], 'v1', NOW).recommendation).toBe(
      'Get this checked as soon as possible: rebalance wheel assembly.',
    );
  });

  test('a class without owner wording gets no made-up cause or advice', () => {
    expect(buildTreadWearRecord([{ label: 'Wavy Wear', maxConfidence: 0.4 }], 'v1', NOW)).toEqual(
      expect.objectContaining({ title: 'Wavy Wear', cause: null, recommendation: null }),
    );
    expect(buildTreadWearRecord([{ label: 'Wavy Wear', maxConfidence: 0.9 }], 'v1', NOW).recommendation).toBe(
      'Get this checked as soon as possible.',
    );
  });

  test('critical if any class reaches 0.60; other titles listed once, without the main one', () => {
    const r = buildTreadWearRecord(
      [
        { label: 'Shoulder Wear Left', maxConfidence: 0.7 },
        { label: 'Shoulder Wear Right', maxConfidence: 0.65 },
        { label: 'Spotty Wear', maxConfidence: 0.3 },
        { label: 'Rip Depression and Punch Wear', maxConfidence: 0.28 },
      ],
      'v1',
      NOW,
    );
    expect(r.severity).toBe('critical');
    expect(r.title).toBe('Shoulder Wear');
    expect(r.alsoSeen).toEqual(['Patchy Spot Wear']);
  });
});

test('withTreadWear changes only the wear fields', () => {
  const before = result({ status: 'replace_soon', wearPattern: 'Even' });
  const record = buildTreadWearRecord([{ label: 'Center Wear', maxConfidence: 0.4 }], 'v1', NOW);
  expect(withTreadWear(before, record)).toEqual({ ...before, wearPattern: 'Center Tread Wear', treadWear: record });
});

describe('wearReportLines', () => {
  const lines = (findings: { label: string; maxConfidence: number }[]) =>
    wearReportLines(withTreadWear(result(), buildTreadWearRecord(findings, 'v1', NOW)));

  test('normal, detected and critical', () => {
    expect(lines([])).toEqual({ pattern: 'Wear: Normal Wear Distribution', recommendation: null });
    expect(lines([{ label: 'Center Wear', maxConfidence: 0.4 }])).toEqual({
      pattern: 'Wear: Center Tread Wear · Wear pattern found',
      recommendation: 'Adjust tyre pressure',
    });
    expect(lines([{ label: 'Center Wear', maxConfidence: 0.8 }])).toEqual({
      pattern: 'Wear: Center Tread Wear · Maintenance needed',
      recommendation: 'Get this checked as soon as possible: adjust tyre pressure.',
    });
  });

  test('results saved before the wear model: analyzer pattern if any, else nothing', () => {
    expect(wearReportLines(result({ wearPattern: 'Even' }))).toEqual({ pattern: 'Wear: Even', recommendation: null });
    expect(wearReportLines(result())).toBeNull();
    expect(wearReportLines({ ...result(), treadWear: null })).toBeNull();
  });
});

describe('report and PDF', () => {
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
  const critical = buildTreadWearRecord([{ label: 'Center Wear', maxConfidence: 0.8 }], 'v1', NOW);
  const normal = buildTreadWearRecord([], 'v1', NOW);
  const inspection: Inspection = {
    id: 'i',
    createdAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    plate: 'ABC-1234',
    chassis: null,
    tyres: [
      tyre('Left front', { state: 'done', result: withTreadWear(result(), critical) }),
      tyre('Right front', { state: 'done', result: withTreadWear(result(), normal) }),
      tyre('Left rear', { state: 'done', result: result() }),
      tyre('Right rear', { state: 'pending_analysis', treadFrames: ['t.jpg'] }),
    ],
    reportPath: null,
    analyzerVersion: 'tflite:test',
  };

  test('report rows carry the wear pattern and recommendation', () => {
    expect(reportTyreRows(inspection).map(r => [r.position, r.status, r.wear, r.wearRecommendation])).toEqual([
      ['Left front', 'good', 'Wear: Center Tread Wear · Maintenance needed', 'Get this checked as soon as possible: adjust tyre pressure.'],
      ['Right front', 'good', 'Wear: Normal Wear Distribution', null],
      ['Left rear', 'good', null, null],
      ['Right rear', null, null, null],
    ]);
  });

  test('the PDF includes them, escaped, and the status badges are unchanged', () => {
    const html = reportHtml(inspection, { demo: false });
    expect(html).toContain('<div class="wear">Wear: Center Tread Wear · Maintenance needed</div>');
    expect(html).toContain('<div class="advice">Get this checked as soon as possible: adjust tyre pressure.</div>');
    expect(html).toContain('<div class="wear">Wear: Normal Wear Distribution</div>');
    expect(html.match(/class="advice"/g)).toHaveLength(1);
    expect(html.match(/>Good</g)).toHaveLength(3);
    expect(html).toContain('All scanned tyres are in good condition');
    expect(html).toContain(`<div class="advisory">${CRITICAL_WEAR_ADVISORY}</div>`);
  });

  describe('summary advisory', () => {
    const withTyres = (...tyres: TyreInspection[]): Inspection => ({ ...inspection, tyres });
    const detected = buildTreadWearRecord([{ label: 'Center Wear', maxConfidence: 0.4 }], 'v1', NOW);

    test('all Good with critical wear: headline unchanged, advisory beneath it', () => {
      expect(reportSummary(inspection)).toEqual({
        status: 'good',
        headline: 'All scanned tyres are in good condition',
        detail: '1 tyre is waiting for analysis.',
        advisory: 'Maintenance attention recommended for detected wear patterns.',
      });
    });

    test('no advisory for wear below critical, normal wear, or no wear check', () => {
      expect(
        reportSummary(
          withTyres(
            tyre('A', { state: 'done', result: withTreadWear(result(), detected) }),
            tyre('B', { state: 'done', result: withTreadWear(result(), normal) }),
            tyre('C', { state: 'done', result: result({ wearPattern: 'Even' }) }),
          ),
        ).advisory,
      ).toBeNull();
    });

    test('no advisory when the status is already Replace soon or Replace now', () => {
      for (const status of ['replace_soon', 'replace_now'] as const) {
        const s = reportSummary(
          withTyres(
            tyre('A', { state: 'done', result: withTreadWear(result(), critical) }),
            tyre('B', { state: 'done', result: result({ status }) }),
          ),
        );
        expect(s.status).toBe(status);
        expect(s.advisory).toBeNull();
      }
    });

    test('no advisory when no tyre was analysed', () => {
      expect(reportSummary(withTyres(tyre('A', { state: 'skipped' }))).advisory).toBeNull();
    });

    test('the PDF leaves the advisory out when there is none', () => {
      const html = reportHtml(withTyres(tyre('A', { state: 'done', result: withTreadWear(result(), detected) })), {
        demo: false,
      });
      expect(html).not.toContain('class="advisory"');
      expect(html).not.toContain(CRITICAL_WEAR_ADVISORY);
    });
  });

  test('wear text in the PDF is escaped', () => {
    const odd = { ...critical, title: '<b>x</b>', recommendation: 'A & B' };
    const html = reportHtml(
      { ...inspection, tyres: [tyre('Left front', { state: 'done', result: withTreadWear(result(), odd) })] },
      { demo: false },
    );
    expect(html).toContain('Wear: &lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('A &amp; B');
  });
});
