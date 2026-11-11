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

/**
 * - `none`: the wear model ran and found no wear pattern.
 * - `detected`: a wear pattern below the critical confidence.
 * - `critical`: a wear pattern at or above the critical confidence, or a
 *   damage class that raised the status.
 * Severity itself never changes TyreStatus; `TreadWearRecord.minimumStatus` does.
 */
export type TreadWearSeverity = 'none' | 'detected' | 'critical';

/** The tread wear check as saved with a tyre result, and as shown in the app and report. */
export type TreadWearRecord = {
  severity: TreadWearSeverity;
  /**
   * Lowest status this check forces (owner decision 2026-11-10): exposed
   * cords or a bulge → Replace now, cracking or a puncture → Replace soon.
   * Null when nothing raises it. Absent on records saved before 2026-11-10.
   */
  minimumStatus?: TyreStatus | null;
  /** Strongest raw model class, or null when none was found. */
  label: string | null;
  /** User-facing title, e.g. `Center Tread Wear` or `No Abnormal Wear Pattern Detected`. */
  title: string;
  /** Likely cause, or null when there's no owner-supplied wording for the class. */
  cause: string | null;
  /** Maintenance recommendation, or null when there's nothing to recommend. */
  recommendation: string | null;
  /** Highest confidence of the strongest class, 0–1; null when none was found. */
  confidence: number | null;
  /** Titles of other wear patterns found, strongest first, without repeats. */
  alsoSeen: string[];
  /** Manifest version of the model that made it. */
  modelVersion: string;
  checkedAt: string;
};

export type TyreResult = {
  status: TyreStatus;
  treadDepthMm: number | null;
  treadConfidence: number | null;
  /** Shown in the Wear pattern row. Set to `treadWear.title` once the wear model has run. */
  wearPattern: string | null;
  /**
   * Not in the spec's model (owner decision 2026-11-06): what the tread wear
   * model found. Absent on results saved before it existed, null until it runs.
   * Can only raise `status`, through `minimumStatus` (owner decision 2026-11-10).
   */
  treadWear?: TreadWearRecord | null;
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
