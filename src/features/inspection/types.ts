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
  | 'failed'
  /**
   * Not in the spec's union (owner decision, M6): frames are captured and saved,
   * but the tyre models aren't in this build, so there's no result. Nothing is
   * made up; the tyre waits for analysis and the inspection carries on.
   */
  | 'pending_analysis';

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

/**
 * Why a capture stage failed. `dark`, `blur`, `distance` and `not_found` are
 * the spec's reasons; `distance` and `not_found` need the tyre detector.
 * `glare`, `unsteady` and `too_few_frames` were added (owner decision) so
 * the app never claims a tyre wasn't detected without a detector.
 */
export type CaptureErrorReason =
  | 'dark'
  | 'blur'
  | 'distance'
  | 'not_found'
  | 'glare'
  | 'unsteady'
  | 'too_few_frames';

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
