// Sidewall OCR calibration logs. OFF by default in every build, so nothing
// is logged unless a developer turns it on while calibrating on real tyres:
//
//   import { setSidewallDebug } from './src/ml/ocr/sidewallDebug';
//   setSidewallDebug(true);   // then: adb logcat | grep SidewallOCR
//
// Only heuristic decisions (brand matches, the DOT O→0 fix, size recovery,
// grouped model reads, date-code-only DOT), failures and a one-line summary
// per read are logged. Logs go to the device log only; nothing is sent anywhere.

export const SIDEWALL_LOG_TAG = '[SidewallOCR]';

let enabled = false;

export function setSidewallDebug(on: boolean): void {
  enabled = on;
}

export function sidewallLog(message: string, data?: unknown): void {
  if (!enabled) return;
  if (data === undefined) console.log(`${SIDEWALL_LOG_TAG} ${message}`);
  else console.log(`${SIDEWALL_LOG_TAG} ${message}`, JSON.stringify(data));
}
