/**
 * Diagnostic logs that are switched on in EVERY build, including release.
 *
 * TEMPORARY (owner request 2026-11-06): sidewall OCR logs are on so a Release
 * build run from Xcode on an iPhone 13 shows the `[SidewallOCR]` lines (Core ML
 * delegate, text region boxes, OCR text of each region). Logs go to the device
 * log only; nothing is sent anywhere. Plates and chassis numbers are never
 * logged, and full-frame OCR text isn't either (only its parsed values).
 *
 * Turn this off before any store release (docs/RELEASE_CHECKLIST.md).
 */
export const diagnosticsConfig = {
  sidewallOcrLogs: true,
} as const;
