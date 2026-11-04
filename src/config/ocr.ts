/**
 * Vehicle text scanning (M4). Starting values to calibrate on real phones;
 * kept apart from the spec's `inspectionConfig`.
 */
export const ocrConfig = {
  /** Same value this many times… */
  stableReads: 3,
  /** …within this many recent reads opens Confirm plate / Vehicle details. */
  readWindow: 5,
  /** Minimum pause between OCR passes, to limit heat and battery use. */
  scanIntervalMs: 350,
  /** Extra margin around the guide box when cropping, as a fraction of its size. */
  guideMargin: 0.08,
  /** Chassis text shorter than this fraction of the guide height shows `Move closer`. */
  chassisMinTextHeightRatio: 0.18,
  /** Plate candidates: letters and numbers only, not counting spaces or hyphens. */
  plateMinChars: 2,
  plateMaxChars: 10,
  /** Chassis candidates (spec §5: 5 to 17 letters and numbers). */
  chassisMinChars: 5,
  chassisMaxChars: 17,
};
