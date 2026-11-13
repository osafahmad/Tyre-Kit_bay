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
  /**
   * Tread sweep direction (owner requests 2026-11-12; `sweepMotion.ts`).
   * Round 2 (iPhone 13 video): the profile runs along the whole on-screen
   * width, so travel is in SCREEN WIDTHS. All `estimate`; calibrate with the
   * `[TreadWear] sweep:` log lines on a phone (docs/RELEASE_CHECKLIST.md).
   * estimate. Luminance profile bins across the screen width.
   */
  sweepProfileBins: 64,
  /** estimate. Centred band of the screen height averaged into the profile, as a fraction. */
  sweepProfileBand: 0.5,
  /** estimate. Largest shift searched between analysed frames, in bins (±): a quarter of the screen. */
  sweepMaxShiftBins: 16,
  /** estimate. Mean absolute deviation 0–255 of a profile below which it's too flat to track. */
  sweepMinTexture: 2,
  /** estimate. Best match cost must be at most this fraction of the worst, or the shift is unknown. */
  sweepMaxMatchRatio: 0.8,
  /** estimate. Repetitive tread: matches within this fraction of the cost range of the best count as equal; the one nearest the previous shift wins. */
  sweepAliasTolerance: 0.15,
  /** estimate. Per-frame travel, in screen widths, below which the camera counts as still (half a bin). */
  sweepDeadBand: 0.008,
  /**
   * Leftward travel, in screen widths, that locks the sweep (`Move right`).
   * 0.08 from the iPhone 13 sweep logs (owner 2026-11-12): 0.04 flickered the
   * pill during pauses in a slow sweep.
   */
  sweepReverseLatch: 0.08,
  /**
   * Rightward travel, in screen widths, that fills all 4 chevrons (and allows
   * the last of `treadTargetFrames`). iPhone 13 sweep logs (owner 2026-11-12):
   * a full edge-to-edge sweep reached travel 0.973; 0.65 completes the 4th
   * chevron and 10th frame before the camera runs past the tyre edge.
   */
  treadSweepTravel: 0.65,
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
   * UNCALIBRATED (owner value 2026-11-10). Sidewall OCR first reads the central
   * part of each saved frame (already cropped to the guide): this fraction of
   * its width and height, centred, as a stand-in for the old detector crop's
   * zoom. The whole frame is read too when the crop gives nothing.
   */
  sidewallCentreCropRatio: 0.6,
  /**
   * UNCALIBRATED. Size and make: a single valid read is suggested even without
   * a second agreeing frame (owner decisions 2026-11-10, see sidewallReader.ts).
   * DOT/TIN: a value is only suggested when this many frames read
   * the same text for it (ignoring case and spaces). One stray read isn't enough.
   */
  sidewallMinAgreeingReads: 2,
  /** UNCALIBRATED. Most OCR runs (one per saved frame) for one sidewall, to bound the wait on slow phones. */
  sidewallMaxOcrRuns: 24,
};

/**
 * Tread presence check (owner request 2026-11-13: a wall or floor swept as a
 * tread still showed `6.2 mm · Good` and `No Surface Defects Detected`). Run on
 * the saved tread frames before any tread result is shown
 * (`src/ml/services/treadPresence.ts`). ALL `estimate`, UNCALIBRATED: set from
 * what tyre rubber usually looks like, to be tuned from the `[TreadWear]
 * presence:` log lines on real tyres, walls and floors.
 */
export const treadPresenceConfig = {
  /** estimate. Frames are scaled to this width (aspect kept) before the pixels are read. */
  analysisWidth: 160,
  /** estimate. Most frames checked per scan, spread evenly over the saved frames. */
  maxFramesChecked: 5,
  /** estimate. Fewer readable frames than this gives `insufficient_frames` (not a verdict). */
  minFrames: 3,
  /** estimate. Fraction of readable frames that must look like tread for the scan to count as tread. */
  minPassFraction: 0.5,
  // Loosened 2026-11-13 (owner: real tread sweeps were blocked). Previous values in brackets.
  /** estimate [150]. Median luminance 0–255 above this is too bright for tread rubber (walls, paper, sky). Dusty or sunlit rubber reads grey. */
  maxMedianLuminance: 175,
  /** estimate [8]. Median luminance below this is a covered lens or darkness, not rubber under light. */
  minMedianLuminance: 5,
  /** estimate [0.35]. Median HSV saturation 0–1 above this is a coloured surface, not charcoal rubber. Warm or sodium lighting tints rubber. */
  maxMedianSaturation: 0.45,
  /** estimate [0.2]. Fraction of pixels with luminance ≥ 235 above this is glare or a blown-out surface. */
  maxBlownOutFraction: 0.3,
  /** estimate [20]. Neighbouring-pixel luminance difference that counts as an edge (groove wall, sipe). Worn grooves are shallower. */
  edgeDelta: 16,
  /** estimate [0.05]. Fraction of neighbour pairs, along the stronger axis, that must be edges. Smooth surfaces are near 0. */
  minStrongEdgeFraction: 0.03,
  /** estimate [5]. Mean neighbour luminance difference, along the stronger axis, below which the surface is smooth. */
  minMeanGradient: 3.5,
} as const;

/**
 * Stage 3 detector crop OCR on Sidewall captured (owner request 2026-11-13,
 * `src/ml/services/sidewallCropPass.ts`).
 */
export const sidewallCropConfig = {
  /**
   * estimate. Saved sidewall frames the detector + crop OCR pass runs on,
   * spread over the scan. Each box costs 4 ML Kit runs (0°, 90° CW, 90° CCW,
   * 180°), so 3 frames with ~5 boxes is ~60 runs. Raise only after timing it on a phone.
   */
  maxFrames: 3,
} as const;
