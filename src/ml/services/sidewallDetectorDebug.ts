// Sidewall text detector diagnostics logs (`[SidewallDetector]`). Turned on
// at start-up from `diagnosticsConfig.sidewallDetectorLogs` (index.js). OFF by
// default, so tests and any build that doesn't turn them on log nothing.
//
//   iOS: Xcode console / Console.app, filter `SidewallDetector`
//   Android: adb logcat | grep SidewallDetector
//
// Logged (Stage 1):
// - Model load: delegate tried, failures, load time, the tensors allocated.
// - Per frame: source size, letterbox geometry, decode / inference / post
//   times, raw output value ranges (boxes, best score per class, mask
//   coefficients, prototypes), the box format used, and every detection
//   (label, score, box in input and frame pixels).
//
// - Stage 2, per box: the crop rectangle, the ML Kit text of each orientation
//   and the orientation kept. Raw crop text goes to the console only when
//   `sidewallOcrLogs` is on (development), like `[SidewallOCR]`.
//
// Frames are referred to by index. No frame paths, plates or chassis numbers
// are logged. Logs go to the device log only; nothing is sent anywhere.
//
// Staging builds (`diagnosticsConfig.enableStagingLogs`) also keep each line
// in the in-memory buffer of `src/utils/debugLogBuffer.ts` for "Copy logs".

import { isDebugLogBufferEnabled, logTime, recordDebugLog } from '../../utils/debugLogBuffer';

export const SIDEWALL_DETECTOR_LOG_TAG = '[SidewallDetector]';

let enabled = false;
let rawTextOnConsole = false;

/**
 * `on`: the `[SidewallDetector]` console lines. `rawText`: whether lines that
 * carry raw OCR text of a crop (Stage 2) may go to the console too; index.js
 * passes `diagnosticsConfig.sidewallOcrLogs`, so like `[SidewallOCR]` no raw
 * sidewall text reaches a release device log. The staging buffer keeps them
 * either way (it exists to carry raw text, and is off for store builds).
 */
export function setSidewallDetectorDebug(on: boolean, rawText: boolean = false): void {
  enabled = on;
  rawTextOnConsole = rawText;
}

/** Whether `sidewallDetectorLog` goes anywhere: the console, or the staging buffer. */
export function isSidewallDetectorDebugEnabled(): boolean {
  return enabled || isDebugLogBufferEnabled();
}

export function sidewallDetectorLog(message: string, data?: unknown, options: { rawText?: boolean } = {}): void {
  const buffer = isDebugLogBufferEnabled();
  if (!enabled && !buffer) return;
  const line = `${SIDEWALL_DETECTOR_LOG_TAG} ${logTime()} ${message}`;
  const json = data === undefined ? undefined : JSON.stringify(data);
  if (enabled && (!options.rawText || rawTextOnConsole)) {
    if (json === undefined) console.log(line);
    else console.log(line, json);
  }
  if (buffer) recordDebugLog(json === undefined ? line : `${line} ${json}`);
}
