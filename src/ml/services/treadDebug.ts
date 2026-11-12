// Tread wear diagnostics logs (`[TreadWear]`). Turned on at start-up from
// `diagnosticsConfig.treadWearLogs` (index.js). OFF by default, so tests and
// any build that doesn't turn them on log nothing.
//
//   iOS: Xcode console / Console.app, filter `TreadWear`
//   Android: adb logcat | grep TreadWear
//
// Logged:
// - Scan start, with the number of saved tread frames.
// - Model load: delegate tried (Core ML on iOS, GPU on Android, then CPU),
//   failures, and load time.
// - Tensors allocated: input and output names, shapes and types.
// - Per frame: decode and inference time, the highest raw score of each class,
//   and every detection (class, confidence, box).
// - Cross-frame consensus: findings, the winning pattern and its severity.
// - When the card and the Wear pattern row change state.
//
// Every line starts with a wall-clock timestamp. No frame paths, plates,
// chassis numbers or OCR text are logged; frames are referred to by index.
// Logs go to the device log only; nothing is sent anywhere.
//
// Staging builds (`diagnosticsConfig.enableStagingLogs`, owner request
// 2026-11-12) also keep each line in the in-memory buffer of
// `src/utils/debugLogBuffer.ts` for "Copy logs".

import { isDebugLogBufferEnabled, logTime, recordDebugLog } from '../../utils/debugLogBuffer';

export const TREAD_LOG_TAG = '[TreadWear]';

let enabled = false;

export function setTreadDebug(on: boolean): void {
  enabled = on;
}

/** Whether `treadLog` goes anywhere: the console, or the staging buffer. */
export function isTreadDebugEnabled(): boolean {
  return enabled || isDebugLogBufferEnabled();
}

/** `HH:MM:SS.mmm`, local time. */
export const treadLogTime = logTime;

export function treadLog(message: string, data?: unknown): void {
  const buffer = isDebugLogBufferEnabled();
  if (!enabled && !buffer) return;
  const line = `${TREAD_LOG_TAG} ${treadLogTime()} ${message}`;
  const json = data === undefined ? undefined : JSON.stringify(data);
  if (enabled) {
    if (json === undefined) console.log(line);
    else console.log(line, json);
  }
  if (buffer) recordDebugLog(json === undefined ? line : `${line} ${json}`);
}

/** Rounds to 3 decimals for logs. */
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
