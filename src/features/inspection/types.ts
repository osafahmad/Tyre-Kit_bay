// Data model from TYRE_KIT_BAY_SPEC.md §6.

export type TyreStatus = 'good' | 'replace_soon' | 'replace_now';

export type TyreFlowState =
  | 'waiting'
  | 'capturing_sidewall'
  | 'capturing_tread'
  | 'captured'
  | 'analysing'
  | 'done'
  | 'skipped'
  | 'failed';

export type TyreResult = {
  status: TyreStatus;
  treadDepthMm: number | null;
  treadConfidence: number | null;
  wearPattern: string | null;
  damageFound: boolean | null;
  damageConfidence: number | null;
  size: string | null;
  rimInches: number | null;
  make: string | null;
  model: string | null;
  dotTin: string | null;
  ageYears: number | null;
  ageMonths: number | null;
};

export type CaptureErrorReason = 'dark' | 'blur' | 'distance' | 'not_found';

/** Sidewall text as read by OCR and then checked or corrected by the user. */
export type SidewallDetails = {
  size: string | null;
  dotTin: string | null;
  make: string | null;
  model: string | null;
};

export type TyreInspection = {
  id: string;
  position: string;
  state: TyreFlowState;
  sidewallFrames: string[];
  treadFrames: string[];
  result: TyreResult | null;
  errorReason: CaptureErrorReason | 'analysis_failed' | null;
  /** Not in the spec's model: needed so corrected fields survive a restart. */
  sidewallDetails: SidewallDetails;
};

export type Inspection = {
  id: string;
  createdAt: string;
  completedAt: string | null;
  plate: string | null;
  chassis: string | null;
  tyres: TyreInspection[];
  reportPath: string | null;
  analyzerVersion: string;
};
