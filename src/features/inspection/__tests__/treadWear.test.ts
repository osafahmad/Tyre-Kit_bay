import { escapeHtml, reportHtml } from '../../report/reportHtml';
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
      minimumStatus: null,
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

  test('normal_even_wear is never a finding, even as the strongest class', () => {
    expect(buildTreadWearRecord([{ label: 'normal_even_wear', maxConfidence: 0.95 }], 'v1', NOW)).toEqual(
      buildTreadWearRecord([], 'v1', NOW),
    );
    // A defect found alongside it still counts.
    const r = buildTreadWearRecord(
      [
        { label: 'normal_even_wear', maxConfidence: 0.9 },
        { label: 'feathering', maxConfidence: 0.4 },
      ],
      'v1',
      NOW,
    );
    expect(r).toEqual(expect.objectContaining({ severity: 'detected', label: 'feathering', alsoSeen: [] }));
  });

  test('below 0.60: cleaned-up title, no made-up cause or advice (owner wording to follow)', () => {
    expect(buildTreadWearRecord([{ label: 'feathering', maxConfidence: 0.5 }], 'v1', NOW)).toEqual(
      expect.objectContaining({
        severity: 'detected',
        minimumStatus: null,
        label: 'feathering',
        title: 'Feathering',
        cause: null,
        recommendation: null,
        confidence: 0.5,
      }),
    );
  });

  test('0.60 and above: urgent recommendation without class advice', () => {
    expect(buildTreadWearRecord([{ label: 'diagonal_wear', maxConfidence: 0.6 }], 'v1', NOW).recommendation).toBe(
      'Get this checked as soon as possible.',
    );
  });

  test('critical if any class reaches 0.60; other titles listed once, without the main one', () => {
    const r = buildTreadWearRecord(
      [
        { label: 'shoulder_wear', maxConfidence: 0.7 },
        { label: 'inner_edge_wear', maxConfidence: 0.65 },
        { label: 'flat_spot', maxConfidence: 0.36 },
      ],
      'v1',
      NOW,
    );
    expect(r.severity).toBe('critical');
    expect(r.minimumStatus).toBeNull();
    expect(r.title).toBe('Shoulder Wear');
    expect(r.alsoSeen).toEqual(['Inner Edge Wear', 'Flat Spot']);
  });
});

describe('damage classes raise the status (owner decision 2026-11-10)', () => {
  const rec = (...f: [string, number][]) =>
    buildTreadWearRecord(f.map(([label, maxConfidence]) => ({ label, maxConfidence })), 'v1', NOW);

  test.each([
    ['exposed_cords', 0.5, 'replace_now'],
    ['sidewall_bulge', 0.5, 'replace_now'],
    ['exposed_cords', 0.49, null],
    ['sidewall_bulge', 0.36, null],
    ['cracking_dry_rot', 0.35, 'replace_soon'],
    ['puncture_object', 0.35, 'replace_soon'],
    ['center_wear', 0.99, null],
    ['normal_even_wear', 0.99, null],
  ])('%s at %s → minimum status %s', (label, c, status) => {
    expect(rec([label, c]).minimumStatus).toBe(status);
  });

  test('a status-raising finding is shown first and is critical, even when weaker', () => {
    const r = rec(['center_wear', 0.9], ['exposed_cords', 0.55]);
    expect(r).toEqual(
      expect.objectContaining({
        severity: 'critical',
        minimumStatus: 'replace_now',
        label: 'exposed_cords',
        title: 'Exposed Cords',
        alsoSeen: ['Center Wear'],
      }),
    );
    expect(rec(['puncture_object', 0.4]).severity).toBe('critical');
  });

  test('the worst rule wins', () => {
    expect(rec(['cracking_dry_rot', 0.9], ['sidewall_bulge', 0.6]).minimumStatus).toBe('replace_now');
    expect(rec(['cracking_dry_rot', 0.9], ['sidewall_bulge', 0.4]).minimumStatus).toBe('replace_soon');
  });

  test('withTreadWear raises the status, never lowers it', () => {
    const now = rec(['exposed_cords', 0.8]);
    const soon = rec(['cracking_dry_rot', 0.4]);
    expect(withTreadWear(result({ status: 'good' }), now).status).toBe('replace_now');
    expect(withTreadWear(result({ status: 'good' }), soon).status).toBe('replace_soon');
    expect(withTreadWear(result({ status: 'replace_now' }), soon).status).toBe('replace_now');
    expect(withTreadWear(result({ status: 'replace_soon' }), rec()).status).toBe('replace_soon');
  });

  test('records saved before 2026-11-10 (no minimumStatus) leave the status alone', () => {
    const old = { ...rec(['center_wear', 0.8]) };
    delete old.minimumStatus;
    expect(withTreadWear(result({ status: 'good' }), old).status).toBe('good');
  });
});

test('withTreadWear without a status-raising finding changes only the wear fields', () => {
  const before = result({ status: 'replace_soon', wearPattern: 'Even' });
  const record = buildTreadWearRecord([{ label: 'center_wear', maxConfidence: 0.4 }], 'v1', NOW);
  expect(withTreadWear(before, record)).toEqual({ ...before, wearPattern: 'Center Wear', treadWear: record });
});

describe('wearReportLines', () => {
  const lines = (findings: { label: string; maxConfidence: number }[]) =>
    wearReportLines(withTreadWear(result(), buildTreadWearRecord(findings, 'v1', NOW)));

  test('normal, detected and critical', () => {
    expect(lines([])).toEqual({ pattern: 'Wear: Normal Wear Distribution', recommendation: null });
    expect(lines([{ label: 'center_wear', maxConfidence: 0.4 }])).toEqual({
      pattern: 'Wear: Center Wear · Wear pattern found',
      recommendation: null,
    });
    expect(lines([{ label: 'center_wear', maxConfidence: 0.8 }])).toEqual({
      pattern: 'Wear: Center Wear · Maintenance needed',
      recommendation: 'Get this checked as soon as possible.',
    });
  });

  test('results saved before the wear model: analyzer pattern if any, else nothing', () => {
    expect(wearReportLines(result({ wearPattern: 'Even' }))).toEqual({ pattern: 'Wear: Even', recommendation: null });
    expect(wearReportLines(result())).toBeNull();
    expect(wearReportLines({ ...result(), treadWear: null })).toBeNull();
  });
});

describe('wear separator', () => {
  // Written as · so an editor can't swap it for a lookalike or a bullet.
  const DOT = '·';

  test.each([
    [0.4, 'Wear pattern found'],
    [0.8, 'Maintenance needed'],
  ])('"Wear: {title} · {severity}" with a U+00B7 and one space each side (confidence %s)', (c, severity) => {
    const { pattern } = wearReportLines(
      withTreadWear(result(), buildTreadWearRecord([{ label: 'center_wear', maxConfidence: c }], 'v1', NOW)),
    )!;
    expect(pattern).toBe(`Wear: Center Wear ${DOT} ${severity}`);
    expect(pattern).toMatch(/^Wear: [^·]+[^ ] · [^ ][^·]+$/);
  });

  test('HTML escaping keeps the dot and its spacing', () => {
    expect(escapeHtml(`a ${DOT} b`)).toBe(`a ${DOT} b`);
  });

  test('the PDF keeps the dot, also when the title needs escaping', () => {
    const record = { ...buildTreadWearRecord([{ label: 'center_wear', maxConfidence: 0.8 }], 'v1', NOW), title: 'A & <B>' };
    const html = reportHtml(
      {
        id: 'i',
        createdAt: NOW.toISOString(),
        completedAt: null,
        plate: null,
        chassis: null,
        tyres: [
          {
            id: 't',
            position: 'Left front',
            state: 'done',
            sidewallFrames: [],
            treadFrames: [],
            result: withTreadWear(result(), record),
            errorReason: null,
            sidewallDetails: emptySidewallDetails,
          },
        ],
        reportPath: null,
        analyzerVersion: 'tflite:test',
      },
      { demo: false },
    );
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain(`<div class="wear">Wear: A &amp; &lt;B&gt; ${DOT} Maintenance needed</div>`);
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
  const critical = buildTreadWearRecord([{ label: 'center_wear', maxConfidence: 0.8 }], 'v1', NOW);
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
      ['Left front', 'good', 'Wear: Center Wear · Maintenance needed', 'Get this checked as soon as possible.'],
      ['Right front', 'good', 'Wear: Normal Wear Distribution', null],
      ['Left rear', 'good', null, null],
      ['Right rear', null, null, null],
    ]);
  });

  test('the PDF includes them, escaped, and the status badges are unchanged', () => {
    const html = reportHtml(inspection, { demo: false });
    expect(html).toContain('<div class="wear">Wear: Center Wear · Maintenance needed</div>');
    expect(html).toContain('<div class="advice">Get this checked as soon as possible.</div>');
    expect(html).toContain('<div class="wear">Wear: Normal Wear Distribution</div>');
    expect(html.match(/class="advice"/g)).toHaveLength(1);
    expect(html.match(/>Good</g)).toHaveLength(3);
    expect(html).toContain('All scanned tyres are in good condition');
    expect(html).toContain(`<div class="advisory">${CRITICAL_WEAR_ADVISORY}</div>`);
  });

  describe('summary advisory', () => {
    const withTyres = (...tyres: TyreInspection[]): Inspection => ({ ...inspection, tyres });
    const detected = buildTreadWearRecord([{ label: 'center_wear', maxConfidence: 0.4 }], 'v1', NOW);

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
