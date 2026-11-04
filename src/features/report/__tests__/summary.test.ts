import { joinPositions, reportSummary } from '../summary';
import type { Inspection, TyreInspection, TyreStatus } from '../../inspection/types';
import { emptySidewallDetails } from '../../inspection/store';

function tyre(position: string, status: TyreStatus | null): TyreInspection {
  return {
    id: position,
    position,
    state: status ? 'done' : 'skipped',
    sidewallFrames: [],
    treadFrames: [],
    errorReason: null,
    sidewallDetails: emptySidewallDetails,
    result: status
      ? {
          status,
          treadDepthMm: 5,
          treadConfidence: null,
          wearPattern: null,
          damageFound: false,
          damageConfidence: null,
          size: null,
          rimInches: null,
          make: null,
          model: null,
          dotTin: null,
          ageYears: null,
          ageMonths: null,
        }
      : null,
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
  analyzerVersion: 'demo-1',
});

test('joins positions', () => {
  expect(joinPositions(['Right rear'])).toBe('Right rear');
  expect(joinPositions(['Right rear', 'Left rear'])).toBe('Right rear and left rear');
  expect(joinPositions(['Left front', 'Right front', 'Right rear'])).toBe(
    'Left front, right front and right rear',
  );
});

test('mixed statuses lead with the worst', () => {
  const s = reportSummary(
    inspection([
      tyre('Left front', 'good'),
      tyre('Right front', 'replace_soon'),
      tyre('Left rear', 'good'),
      tyre('Right rear', 'replace_now'),
    ]),
  );
  expect(s.status).toBe('replace_now');
  expect(s.headline).toBe('Right rear needs replacing now');
  expect(s.detail).toBe('Right front should be replaced soon.');
});

test('replace soon only', () => {
  const s = reportSummary(inspection([tyre('Left front', 'good'), tyre('Right front', 'replace_soon')]));
  expect(s.headline).toBe('Right front should be replaced soon.');
});

test('all good, with a skipped tyre shown clearly', () => {
  const s = reportSummary(inspection([tyre('Front', 'good'), tyre('Rear', null)]));
  expect(s.status).toBe('good');
  expect(s.headline).toBe('All scanned tyres are in good condition');
  expect(s.detail).toBe("1 tyre wasn't scanned.");
});

test('nothing analysed', () => {
  const s = reportSummary(inspection([tyre('Front', null), tyre('Rear', null)]));
  expect(s.status).toBeNull();
  expect(s.headline).toBe('No tyres were analysed');
});
