/**
 * Diagnostic switches.
 *
 * Sidewall OCR logs (`[SidewallOCR]`: raw ML Kit text of each sidewall frame,
 * parsed values, rejection reasons, recovery decisions) are on in development
 * builds only (`__DEV__`). They were on in every build from 2026-11-06 to
 * 2026-11-10 for iPhone 13 Release diagnostics; turned off for release on
 * 2026-11-10 (owner request) so raw OCR text never reaches a production
 * device log. Logs go to the device console only; nothing is sent anywhere.
 */
export const diagnosticsConfig = {
  sidewallOcrLogs: __DEV__,
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
