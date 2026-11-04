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
  /** estimate. JPEG quality of saved frames. */
  jpegQuality: 0.9,
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
  /** spec §5: chassis allows 5 to 17 letters and numbers. */
  chassisMinChars: 5,
  chassisMaxChars: 17,
};
