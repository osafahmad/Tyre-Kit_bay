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
  /**
   * STAGING ONLY (owner decision 2026-11-06). While the tread status and damage
   * models are missing, Release builds use the demo analyzer instead of
   * `Analysis pending`, so the full flow (result, Tread Pattern card, report,
   * PDF) can be tested on phones. Every such inspection is saved with the demo
   * analyzer version, so the result, history, report and PDF show `Demo data`.
   * Wear and sidewall OCR still run for real on the captured frames.
   * Ignored once the real tread and damage models are in the manifest.
   * MUST be false for any store build (docs/RELEASE_CHECKLIST.md).
   */
  allowDemoAnalyzerInRelease: true,
} as const;
