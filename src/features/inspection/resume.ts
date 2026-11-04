import { analysedTyres, nextTyre } from './store';
import type { Inspection } from './types';
import type { RootStackParamList } from '../../app/routes';

type Route = {
  [K in keyof RootStackParamList]: { name: K; params?: RootStackParamList[K] };
}[keyof RootStackParamList];

/**
 * Screens to rebuild above Home when continuing an unfinished inspection.
 * Inspection progress sits underneath once any tyre has been worked on, so
 * Back from the resumed screen lands somewhere sensible.
 */
export function resumeRoutes(inspection: Inspection): Route[] {
  if (inspection.tyres.length === 0) {
    return [{ name: 'VehicleDetails' }];
  }
  const tyre = nextTyre(inspection);
  const startedAny =
    analysedTyres(inspection).length > 0 || inspection.tyres.some(t => t.state === 'skipped');
  const base: Route[] = startedAny ? [{ name: 'InspectionProgress' }] : [];
  if (!tyre) return [{ name: 'InspectionProgress' }];

  const tyreId = tyre.id;
  switch (tyre.state) {
    case 'capturing_tread':
      return [...base, { name: 'TreadCapture', params: { tyreId } }];
    case 'captured':
      return [...base, { name: 'FramesCaptured', params: { tyreId } }];
    case 'analysing':
    case 'failed':
      return [...base, { name: 'Analysing', params: { tyreId } }];
    case 'capturing_sidewall':
      return [...base, { name: 'SidewallCapture', params: { tyreId } }];
    case 'waiting':
    default:
      return startedAny
        ? [{ name: 'InspectionProgress' }]
        : [{ name: 'SidewallCapture', params: { tyreId } }];
  }
}
