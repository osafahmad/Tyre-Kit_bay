import { inspectionConfig } from '../../config/inspection';
import type { TyreInspection, TyreStatus } from './types';

const rank: Record<TyreStatus, number> = { good: 0, replace_soon: 1, replace_now: 2 };

export function worstStatus(statuses: readonly TyreStatus[]): TyreStatus | null {
  let worst: TyreStatus | null = null;
  for (const s of statuses) {
    if (worst === null || rank[s] > rank[worst]) {
      worst = s;
    }
  }
  return worst;
}

function atLeast(status: TyreStatus, floor: TyreStatus): TyreStatus {
  return rank[status] >= rank[floor] ? status : floor;
}

export type StatusInputs = {
  /** Class from the tread model, when it returns one. */
  treadClass: TyreStatus | null;
  treadDepthMm: number | null;
  /** Already thresholded with the damage model's confidence threshold from the manifest. */
  damageFound: boolean | null;
  /** Only once the damage model supports a serious-damage class. */
  seriousDamage?: boolean;
  ageYears: number | null;
};

/**
 * Status rules from spec §5. Returns null when there's nothing to base a
 * status on; callers must not invent one.
 */
export function tyreStatus(input: StatusInputs, config = inspectionConfig): TyreStatus | null {
  let status: TyreStatus | null = null;

  if (input.treadClass) {
    status = input.treadClass;
  } else if (input.treadDepthMm !== null) {
    const mm = input.treadDepthMm;
    status =
      mm <= config.tread.replaceNowMaxMm
        ? 'replace_now'
        : mm <= config.tread.replaceSoonMaxMm
          ? 'replace_soon'
          : 'good';
  }
  if (status === null) {
    return null;
  }
  if (input.damageFound) {
    status = atLeast(status, input.seriousDamage ? 'replace_now' : 'replace_soon');
  }
  if (input.ageYears !== null && input.ageYears >= config.age.replaceSoonYears) {
    status = atLeast(status, 'replace_soon');
  }
  return status;
}

/** Worst status across analysed tyres. Skipped / unscanned tyres are ignored. */
export function inspectionStatus(tyres: readonly TyreInspection[]): TyreStatus | null {
  return worstStatus(
    tyres.flatMap(t => (t.state === 'done' && t.result ? [t.result.status] : [])),
  );
}
