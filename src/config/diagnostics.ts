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
   * `[TreadWear]` logs (owner request 2026-11-11, for iPhone verification):
   * model load and delegate, tensor shapes, per-frame scores and boxes, the
   * cross-frame result and when the card and Wear pattern row update. On in
   * every build while tread wear is verified on phones. No frame paths, plates
   * or OCR text are logged. Turn off for store builds (docs/RELEASE_CHECKLIST.md).
   */
  treadWearLogs: true,
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
  /**
   * STAGING GUARD (owner decision 2026-11-11). The tread wear model hasn't been
   * validated on real tyres (it called a sidewall photo camber wear at 0.98),
   * so every wear finding shown in the app, report and PDF carries
   * `Beta / Model Unverified`. Turn off only once the owner has validated the
   * model on real tyres (docs/RELEASE_CHECKLIST.md).
   */
  treadWearModelUnverified: true,
  /**
   * STAGING ONLY (owner request 2026-11-12: testing on a car in an underground
   * car park with a Release build and no console). Keeps the last 300
   * `[SidewallOCR]` and `[TreadWear]` lines in memory, in every build, and
   * shows "Copy logs" on Tyre result and, inside the collapsed "Developer debug"
   * section, on Sidewall captured (`src/utils/debugLogBuffer.ts`; removed there
   * on 2026-11-13, restored 2026-11-14). The lines include raw sidewall OCR text.
   * Nothing is written to disk or sent; they leave the phone only when copied.
   * Console logging still follows the two flags above.
   * MUST be false for any store build (docs/RELEASE_CHECKLIST.md).
   */
  enableStagingLogs: true,
  /**
   * `[SidewallDetector]` logs (owner task 2026-11-13, Stage 1 of the sidewall
   * text detector; YOLOX-Nano since 2026-11-14): model load and delegate, tensor shapes, per-frame
   * timings, raw output value ranges, and every box. No frame paths, plates or
   * OCR text are logged; frames are referred to by index. On in every build
   * while the detector is verified on phones. Turn off for store builds
   * (docs/RELEASE_CHECKLIST.md).
   */
  sidewallDetectorLogs: true,
  /**
   * STAGING ONLY (owner task 2026-11-13, Stage 1; removed 2026-11-13, restored
   * 2026-11-14). Adds the "Sidewall text detector" card to the collapsed
   * "Developer debug" section on Sidewall captured: the saved frame with the
   * detector's boxes, labels and scores drawn on it, a readout of inference
   * time, tensor shapes and raw value ranges, and the crop reads. The card
   * runs its detector pass only once the section is opened. It is a
   * diagnostics view, not a result: nothing on it fills a field. MUST be
   * false for any store build (docs/RELEASE_CHECKLIST.md).
   */
  sidewallDetectorDebugCard: true,
} as const;
