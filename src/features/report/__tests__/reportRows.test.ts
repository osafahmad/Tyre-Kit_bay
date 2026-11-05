import { ANALYSIS_PENDING_LABEL, reportSummary, reportTyreRows } from '../summary';
import type {
  Inspection,
  TyreFlowState,
  TyreInspection,
  TyreResult,
  TyreStatus,
} from '../../inspection/types';
import { emptySidewallDetails } from '../../inspection/store';

const result = (status: TyreStatus, treadDepthMm: number | null): TyreResult => ({
  status,
  treadDepthMm,
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
});

function tyre(
  position: string,
  state: TyreFlowState,
  extra: Partial<TyreInspection> = {},
): TyreInspection {
  return {
    id: position,
    position,
    state,
    sidewallFrames: [],
    treadFrames: [],
    result: null,
    errorReason: null,
    sidewallDetails: emptySidewallDetails,
    ...extra,
  };
}

const inspection = (tyres: TyreInspection[]): Inspection => ({
  id: 'i',
  createdAt: '2026-11-04T11:40:00Z',
  completedAt: '2026-11-04T11:50:00Z',
  plate: null,
  chassis: null,
  tyres,
  reportPath: null,
  analyzerVersion: 'tflite-unconfigured',
});

const frames = (n: number, stage: string) => Array.from({ length: n }, (_, i) => `${stage}_${i}.jpg`);

describe('reportSummary with tyres waiting for analysis', () => {
  test('only pending tyres: says analysis is pending, never a condition', () => {
    const s = reportSummary(
      inspection([tyre('Front', 'pending_analysis'), tyre('Rear', 'pending_analysis')]),
    );
    expect(s).toEqual({
      status: null,
      headline: ANALYSIS_PENDING_LABEL,
      detail: '2 tyres are waiting for analysis.',
    });
  });

  test('pending and skipped are counted separately', () => {
    const s = reportSummary(inspection([tyre('Front', 'pending_analysis'), tyre('Rear', 'skipped')]));
    expect(s.headline).toBe(ANALYSIS_PENDING_LABEL);
    expect(s.detail).toBe("1 tyre is waiting for analysis. 1 tyre wasn't scanned.");
  });

  test('a real result still leads; pending is added to the detail', () => {
    const s = reportSummary(
      inspection([
        tyre('Left front', 'done', { result: result('replace_now', 1.2) }),
        tyre('Right front', 'pending_analysis'),
        tyre('Left rear', 'waiting'),
      ]),
    );
    expect(s.status).toBe('replace_now');
    expect(s.headline).toBe('Left front needs replacing now');
    expect(s.detail).toBe("1 tyre is waiting for analysis. 1 tyre wasn't scanned.");
  });

  test('all good with one pending', () => {
    const s = reportSummary(
      inspection([
        tyre('Front', 'done', { result: result('good', 6) }),
        tyre('Rear', 'pending_analysis'),
      ]),
    );
    expect(s.headline).toBe('All scanned tyres are in good condition');
    expect(s.detail).toBe('1 tyre is waiting for analysis.');
  });
});

describe('reportTyreRows', () => {
  test('one row per selected tyre in scan order, with the right kind', () => {
    const rows = reportTyreRows(
      inspection([
        tyre('Left front', 'done', { result: result('good', 6.2) }),
        tyre('Right front', 'pending_analysis', {
          sidewallFrames: frames(8, 'sidewall'),
          treadFrames: frames(10, 'tread'),
          sidewallDetails: { ...emptySidewallDetails, size: '205/55 R16' },
        }),
        tyre('Left rear', 'skipped'),
        tyre('Right rear', 'failed'),
      ]),
    );
    expect(rows.map(r => [r.position, r.kind, r.status, r.detail, r.label])).toEqual([
      ['Left front', 'result', 'good', '6.2 mm · 215/65 R15', null],
      ['Right front', 'pending', null, '205/55 R16 · 18 frames saved', ANALYSIS_PENDING_LABEL],
      ['Left rear', 'not_scanned', null, '', 'Not scanned'],
      ['Right rear', 'not_scanned', null, '', 'Not scanned'],
    ]);
  });

  test('pending row without a confirmed size shows only the saved frames', () => {
    const [row] = reportTyreRows(
      inspection([tyre('Front', 'pending_analysis', { sidewallFrames: ['a.jpg'] })]),
    );
    expect(row.detail).toBe('1 frame saved');
  });

  test('null tread depth hides mm and keeps the status', () => {
    const [row] = reportTyreRows(
      inspection([tyre('Front', 'done', { result: result('replace_soon', null) })]),
    );
    expect(row.status).toBe('replace_soon');
    expect(row.detail).toBe('215/65 R15');
    expect(row.detail).not.toMatch(/mm/);
  });
});
