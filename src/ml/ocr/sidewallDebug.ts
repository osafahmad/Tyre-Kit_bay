// Sidewall OCR calibration logs. OFF by default. index.js turns them on in
// development builds only (`diagnosticsConfig.sidewallOcrLogs` is `__DEV__`),
// so release builds never log raw OCR text.
//
//   import { setSidewallDebug } from './src/ml/ocr/sidewallDebug';
//   setSidewallDebug(true);   // then: adb logcat | grep SidewallOCR
//
// Logged: the raw ML Kit text of each sidewall frame read (a frame can
// include background text, so this must stay off in release builds), parsed values and why each field was rejected, heuristic
// decisions (the DOT O→0 fix, size recovery, single-read size, date-code-only
// DOT), failures and a summary per read. Logs go to the device log only;
// nothing is sent anywhere.
//
// Staging builds (`diagnosticsConfig.enableStagingLogs`, owner request
// 2026-11-12) also keep each line, with a timestamp, in the in-memory buffer
// of `src/utils/debugLogBuffer.ts` for "Copy logs", even when console logging
// is off. The console stays off in release.

import { isDebugLogBufferEnabled, logTime, recordDebugLog } from '../../utils/debugLogBuffer';

export const SIDEWALL_LOG_TAG = '[SidewallOCR]';

let enabled = false;

export function setSidewallDebug(on: boolean): void {
  enabled = on;
}

export function sidewallLog(message: string, data?: unknown): void {
  const buffer = isDebugLogBufferEnabled();
  if (!enabled && !buffer) return;
  const json = data === undefined ? undefined : JSON.stringify(data);
  if (enabled) {
    if (json === undefined) console.log(`${SIDEWALL_LOG_TAG} ${message}`);
    else console.log(`${SIDEWALL_LOG_TAG} ${message}`, json);
  }
  if (buffer) recordDebugLog(`${SIDEWALL_LOG_TAG} ${logTime()} ${message}${json === undefined ? '' : ` ${json}`}`);
}
