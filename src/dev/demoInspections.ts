import { DEMO_ANALYZER_VERSION } from '../ml/demoAnalyzer';
import { newId, emptySidewallDetails } from '../features/inspection/store';
import type { Inspection, TyreInspection, TyreResult, TyreStatus } from '../features/inspection/types';

/**
 * Development only: sample inspections so Home, History and Report can be
 * checked against the designs. Marked with the demo analyzer version, so
 * every screen labels them `Demo data`. Never used in release builds.
 */
function demoResult(status: TyreStatus, treadDepthMm: number): TyreResult {
  return {
    status,
    treadDepthMm,
    treadConfidence: null,
    wearPattern: 'Even',
    damageFound: false,
    damageConfidence: null,
    size: '215/65 R15',
    rimInches: 15,
    make: 'Bridgestone',
    model: 'Ecopia EP150',
    dotTin: '4B7K 2JX 2623',
    ageYears: 3,
    ageMonths: 4,
  };
}

function tyre(position: string, result: TyreResult | null): TyreInspection {
  return {
    id: newId('tyre'),
    position,
    state: result ? 'done' : 'skipped',
    sidewallFrames: [],
    treadFrames: [],
    result,
    errorReason: null,
    sidewallDetails: emptySidewallDetails,
  };
}

function at(daysAgo: number, hours: number, minutes: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function inspection(
  plate: string | null,
  createdAt: string,
  tyres: TyreInspection[],
  chassis: string | null = null,
): Inspection {
  return {
    id: newId('insp'),
    createdAt,
    completedAt: createdAt,
    plate,
    chassis,
    tyres,
    reportPath: null,
    analyzerVersion: DEMO_ANALYZER_VERSION,
  };
}

export function demoInspections(): Inspection[] {
  return [
    inspection(
      'ABC-1234',
      at(0, 11, 40),
      [
        tyre('Left front', demoResult('good', 6.2)),
        tyre('Right front', demoResult('replace_soon', 3.4)),
        tyre('Left rear', demoResult('good', 5.8)),
        tyre('Right rear', demoResult('replace_now', 1.6)),
      ],
      'JT2BG22K0W0123456',
    ),
    inspection('LEB-7781', at(1, 16, 20), [
      tyre('Left front', demoResult('good', 7.1)),
      tyre('Right front', demoResult('good', 7.0)),
      tyre('Left rear', demoResult('good', 6.4)),
      tyre('Right rear', demoResult('good', 6.5)),
    ]),
    inspection(null, at(2, 10, 5), [
      tyre('Front', demoResult('replace_soon', 3.8)),
      tyre('Rear', null),
    ]),
  ];
}
