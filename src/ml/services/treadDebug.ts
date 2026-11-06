// Tread wear calibration logs. OFF by default in every build, so nothing
// is logged unless a developer turns it on while calibrating on real tyres:
//
//   import { setTreadDebug } from './src/ml/services/treadDebug';
//   setTreadDebug(true);   // then: adb logcat | grep TreadWear
//
// Logs model load (and delegate), per-frame detection counts, failures and a
// one-line summary per scan. No frame paths with personal data, no plates.
// Logs go to the device log only; nothing is sent anywhere.

export const TREAD_LOG_TAG = '[TreadWear]';

let enabled = false;

export function setTreadDebug(on: boolean): void {
  enabled = on;
}

export function isTreadDebugEnabled(): boolean {
  return enabled;
}

export function treadLog(message: string, data?: unknown): void {
  if (!enabled) return;
  if (data === undefined) console.log(`${TREAD_LOG_TAG} ${message}`);
  else console.log(`${TREAD_LOG_TAG} ${message}`, JSON.stringify(data));
}
