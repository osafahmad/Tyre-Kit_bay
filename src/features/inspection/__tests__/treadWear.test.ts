import { escapeHtml, reportHtml } from '../../report/reportHtml';
import { CRITICAL_WEAR_ADVISORY, reportSummary, reportTyreRows } from '../../report/summary';
import { emptySidewallDetails } from '../store';
import { buildTreadWearRecord, wearReportLines, wearUnverifiedNote, withTreadWear, type WearFinding } from '../treadWear';
import type { Inspection, TyreInspection, TyreResult } from '../types';

const NOW = new Date('2026-11-06T12:00:00Z');

/** A finding that 3 frames agree on at 0.70 or above (`TREAD_WEAR_CONSENSUS`). */
const agreed = (label: string, maxConfidence: number): WearFinding => ({ label, maxConfidence, consensusFrames: 3 });
const NOTE = ' (Beta / Model Unverified)';

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
  test('nothing found: No Abnormal Wear Pattern Detected, nothing to recommend', () => {
    expect(buildTreadWearRecord([], 'v1', NOW)).toEqual({
      severity: 'none',
      minimumStatus: null,
      label: null,
      title: 'No Abnormal Wear Pattern Detected',
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

  test('with consensus: urgent recommendation without class advice', () => {
    expect(buildTreadWearRecord([agreed('diagonal_wear', 0.7)], 'v1', NOW).recommendation).toBe(
      'Get this checked as soon as possible.',
    );
  });

  test('critical if any class has consensus; other titles listed once, without the main one', () => {
    const r = buildTreadWearRecord(
      [
        agreed('shoulder_wear', 0.7),
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

describe('cross-frame consensus (owner decision 2026-11-11)', () => {
  const rec = (label: string, maxConfidence: number, consensusFrames?: number) =>
    buildTreadWearRecord([{ label, maxConfidence, consensusFrames }], 'v1', NOW);

  test('fewer than 3 frames at 0.70 or above: shown as detected, never critical, status untouched', () => {
    // The Redmi 13 sidewall scan would have needed 3 strong frames; 2 are not enough.
    for (const frames of [undefined, 0, 1, 2]) {
      expect(rec('camber_wear', 0.98, frames)).toEqual(
        expect.objectContaining({ severity: 'detected', minimumStatus: null, title: 'Camber Wear', recommendation: null }),
      );
      expect(rec('exposed_cords', 0.98, frames)).toEqual(
        expect.objectContaining({ severity: 'detected', minimumStatus: null, title: 'Exposed Cords' }),
      );
      expect(rec('cracking_dry_rot', 0.98, frames).minimumStatus).toBeNull();
    }
  });

  test('3 frames at 0.70 or above: critical, and damage classes raise the status', () => {
    expect(rec('camber_wear', 0.98, 3)).toEqual(expect.objectContaining({ severity: 'critical', minimumStatus: null }));
    expect(rec('exposed_cords', 0.75, 3)).toEqual(
      expect.objectContaining({ severity: 'critical', minimumStatus: 'replace_now' }),
    );
  });

  test('a finding without consensus never outranks or hides one with it', () => {
    const r = buildTreadWearRecord(
      [{ label: 'exposed_cords', maxConfidence: 0.99, consensusFrames: 1 }, agreed('cracking_dry_rot', 0.8)],
      'v1',
      NOW,
    );
    expect(r).toEqual(
      expect.objectContaining({ label: 'cracking_dry_rot', minimumStatus: 'replace_soon', alsoSeen: ['Exposed Cords'] }),
    );
  });
});

describe('damage classes raise the status (owner decision 2026-11-10), with consensus', () => {
  const rec = (...f: [string, number][]) =>
    buildTreadWearRecord(f.map(([label, maxConfidence]) => agreed(label, maxConfidence)), 'v1', NOW);

  test.each([
    ['exposed_cords', 0.7, 'replace_now'],
    ['sidewall_bulge', 0.7, 'replace_now'],
    ['cracking_dry_rot', 0.7, 'replace_soon'],
    ['puncture_object', 0.7, 'replace_soon'],
    ['center_wear', 0.99, null],
    ['normal_even_wear', 0.99, null],
  ])('%s at %s → minimum status %s', (label, c, status) => {
    expect(rec([label, c]).minimumStatus).toBe(status);
  });

  test('a status-raising finding is shown first and is critical, even when weaker', () => {
    const r = rec(['center_wear', 0.9], ['exposed_cords', 0.75]);
    expect(r).toEqual(
      expect.objectContaining({
        severity: 'critical',
        minimumStatus: 'replace_now',
        label: 'exposed_cords',
        title: 'Exposed Cords',
        alsoSeen: ['Center Wear'],
      }),
    );
    expect(rec(['puncture_object', 0.7]).severity).toBe('critical');
  });

  test('the worst rule wins', () => {
    expect(rec(['cracking_dry_rot', 0.9], ['sidewall_bulge', 0.7]).minimumStatus).toBe('replace_now');
    expect(
      buildTreadWearRecord([agreed('cracking_dry_rot', 0.9), { label: 'sidewall_bulge', maxConfidence: 0.9 }], 'v1', NOW)
        .minimumStatus,
    ).toBe('replace_soon');
  });

  test('withTreadWear raises the status, never lowers it', () => {
    const now = rec(['exposed_cords', 0.8]);
    const soon = rec(['cracking_dry_rot', 0.7]);
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
  const lines = (findings: WearFinding[]) =>
    wearReportLines(withTreadWear(result(), buildTreadWearRecord(findings, 'v1', NOW)));

  test('normal, detected and critical', () => {
    // Nothing found: no escalation and no note.
    expect(lines([])).toEqual({ pattern: 'Wear: No Abnormal Wear Pattern Detected', recommendation: null });
    expect(lines([{ label: 'center_wear', maxConfidence: 0.4 }])).toEqual({
      pattern: `Wear: Center Wear · Wear pattern found${NOTE}`,
      recommendation: null,
    });
    expect(lines([agreed('center_wear', 0.8)])).toEqual({
      pattern: `Wear: Center Wear · Maintenance needed${NOTE}`,
      recommendation: 'Get this checked as soon as possible.',
    });
  });

  test('the staging note: findings only, and only while the guard is on', () => {
    expect(wearUnverifiedNote({ severity: 'detected' })).toBe('Beta / Model Unverified');
    expect(wearUnverifiedNote({ severity: 'critical' })).toBe('Beta / Model Unverified');
    expect(wearUnverifiedNote({ severity: 'none' })).toBeNull();
    expect(wearUnverifiedNote(null)).toBeNull();
    expect(wearUnverifiedNote({ severity: 'critical' }, false)).toBeNull();
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
      withTreadWear(result(), buildTreadWearRecord([{ ...agreed('center_wear', c), consensusFrames: c >= 0.7 ? 3 : 0 }], 'v1', NOW)),
    )!;
    expect(pattern).toBe(`Wear: Center Wear ${DOT} ${severity}${NOTE}`);
    expect(pattern).toMatch(/^Wear: [^·]+[^ ] · [^ ][^·]+$/);
  });

  test('HTML escaping keeps the dot and its spacing', () => {
    expect(escapeHtml(`a ${DOT} b`)).toBe(`a ${DOT} b`);
  });

  test('the PDF keeps the dot, also when the title needs escaping', () => {
    const record = { ...buildTreadWearRecord([agreed('center_wear', 0.8)], 'v1', NOW), title: 'A & <B>' };
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
    expect(html).toContain(`<div class="wear">Wear: A &amp; &lt;B&gt; ${DOT} Maintenance needed${NOTE}</div>`);
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
  const critical = buildTreadWearRecord([agreed('center_wear', 0.8)], 'v1', NOW);
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
      ['Left front', 'good', `Wear: Center Wear · Maintenance needed${NOTE}`, 'Get this checked as soon as possible.'],
      ['Right front', 'good', 'Wear: No Abnormal Wear Pattern Detected', null],
      ['Left rear', 'good', null, null],
      ['Right rear', null, null, null],
    ]);
  });

  test('the PDF includes them, escaped, and the status badges are unchanged', () => {
    const html = reportHtml(inspection, { demo: false });
    expect(html).toContain(`<div class="wear">Wear: Center Wear · Maintenance needed${NOTE}</div>`);
    expect(html).toContain('<div class="advice">Get this checked as soon as possible.</div>');
    expect(html).toContain('<div class="wear">Wear: No Abnormal Wear Pattern Detected</div>');
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
