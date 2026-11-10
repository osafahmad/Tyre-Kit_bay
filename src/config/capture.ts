/**
 * Every capture and OCR value the app chose itself, in one place.
 *
 * CALIBRATION STATUS: UNCALIBRATED. Values marked `estimate` are starting
 * guesses and must be calibrated on real phones with real plates, chassis
 * numbers and tyres before release (see docs/RELEASE_CHECKLIST.md). Values
 * marked `spec` come from TYRE_KIT_BAY_SPEC.md. Frame counts and the capture
 * timeout are in `inspectionConfig` (spec §5).
 *
 * These are image-quality and text-selection values only. No model input,
 * output or confidence values live here; those come from `src/ml/manifest.ts`.
 */
export const CALIBRATION_STATUS = 'uncalibrated' as const;

/**
 * JPEG quality as a PERCENT, 0–100. This is react-native-nitro-image's scale
 * for `saveToFileAsync` / `saveToTemporaryFileAsync` (it divides by 100 on iOS
 * and passes it straight to Bitmap.compress on Android). Never pass 0–1
 * fractions such as 0.9: that is 0.9 %, not 90 %. A unit test checks this.
 */
export const JPEG_QUALITY_PERCENT = 90;

/** Tyre capture quality checks (M5, spec §7). */
export const captureConfig = {
  /** estimate (spec §7 says "about 10 frames per second" for the detector). Frames analysed per second. */
  analysisFps: 10,
  /** estimate. Mean luminance 0–255 of the analysed area; below → `Too dark`. */
  minBrightness: 55,
  /** estimate. Above → `Too bright` (glare / overexposed). */
  maxBrightness: 215,
  /** estimate. Laplacian variance; below → blurred. Depends on 720p frames and `sampleStep`. */
  minSharpness: 120,
  /** estimate. Mean 0–255 difference between consecutive thumbnails; above → moving (sidewall). */
  maxSteadyMotion: 6,
  /** estimate. Tread: difference from the last accepted frame needed to count a new one. */
  minTreadNovelty: 5,
  /** estimate. Thumbnail grid side used for motion and novelty. */
  thumbSize: 16,
  /** estimate. Minimum time between accepted sidewall frames. */
  sidewallAcceptIntervalMs: 150,
  /** estimate. Minimum time between accepted tread frames. */
  treadAcceptIntervalMs: 250,
  /** estimate. Sidewall: extra candidates gathered before keeping the sharpest `sidewallTargetFrames`. */
  sidewallExtraCandidates: 4,
  /** estimate. Sidewall: after `sidewallTargetFrames` are in, wait this long for sharper ones. */
  sidewallSettleMs: 1000,
  /** estimate. Sampling grid step in pixels for brightness and sharpness. */
  sampleStep: 4,
  /** estimate. Centre square analysed, as a fraction of the frame's shorter side. */
  analysisRegion: 0.5,
  /** estimate. Margin added around the guide when cropping saved frames, as a fraction of its size. */
  guideMargin: 0.08,
  /** estimate. Below this free space capture doesn't start (spec §8 low storage; value is ours). */
  minFreeBytes: 60 * 1024 * 1024,
  /** JPEG quality of saved tyre frames, PERCENT 0–100 (nitro-image scale). See JPEG_QUALITY_PERCENT. */
  jpegQualityPercent: JPEG_QUALITY_PERCENT,
};

/** Number plate and chassis OCR (M4). */
export const ocrConfig = {
  /** spec §4.8: "the same value repeats across three reads". */
  stableReads: 3,
  /** estimate. …within this many recent reads. */
  readWindow: 5,
  /** estimate. Minimum pause between OCR passes. */
  scanIntervalMs: 350,
  /** estimate. Margin around the guide box when cropping for OCR. */
  guideMargin: 0.08,
  /** estimate. Chassis text shorter than this fraction of the crop height shows `Move closer`. */
  chassisMinTextHeightRatio: 0.18,
  /** estimate. Plate candidates: letters and digits, not counting spaces or hyphens. */
  plateMinChars: 2,
  plateMaxChars: 10,
  /**
   * estimate. Two OCR lines are joined into one two-line plate only when the
   * shorter line is at least this fraction of the taller line's height.
   */
  plateJoinMinHeightRatio: 0.7,
  /** estimate. …and they overlap horizontally by at least this fraction of the narrower line. */
  plateJoinMinHorizontalOverlap: 0.5,
  /** estimate. …and the gap between them is at most this many times the taller line's height. */
  plateJoinMaxGapRatio: 1.0,
  /** estimate. …and they overlap vertically by at most this fraction of the shorter line (so they are stacked, not side by side). */
  plateJoinMaxVerticalOverlap: 0.3,
  /**
   * UNCALIBRATED. Plate guide box in points. The design (PlateScan.dc.html) is
   * 260 × 86, which fits a one-line car plate but not a two-line bike plate;
   * the height was raised for two-line plates. Width is the design's.
   */
  plateGuideWidth: 260,
  plateGuideHeight: 150,
  /** JPEG quality of the OCR crop, PERCENT 0–100 (nitro-image scale). See JPEG_QUALITY_PERCENT. */
  jpegQualityPercent: JPEG_QUALITY_PERCENT,
  /** estimate. A Capture press that no frame has answered by then shows a camera message. */
  manualCaptureTimeoutMs: 3000,
  /**
   * Longest OCR chassis read (a 17-character VIN). OCR reads must also pass
   * `validateChassisCandidate` (8–17, see DECISIONS). Typed chassis numbers
   * follow spec §5 (5 to 17, warn only) in `isUnusualChassis`.
   */
  chassisMaxChars: 17,
  /**
   * UNCALIBRATED. A sidewall value is only suggested when this many frames read
   * the same text for it (ignoring case and spaces). One stray read isn't enough.
   */
  sidewallMinAgreeingReads: 2,
  /** UNCALIBRATED. Most OCR runs (one per saved frame) for one sidewall, to bound the wait on slow phones. */
  sidewallMaxOcrRuns: 24,
};
