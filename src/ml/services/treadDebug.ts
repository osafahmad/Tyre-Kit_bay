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

export const TREAD_LOG_TAG = '[TreadWear]';

let enabled = false;

export function setTreadDebug(on: boolean): void {
  enabled = on;
}

export function isTreadDebugEnabled(): boolean {
  return enabled;
}

/** `HH:MM:SS.mmm`, local time. */
export function treadLogTime(date: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}`;
}

export function treadLog(message: string, data?: unknown): void {
  if (!enabled) return;
  const line = `${TREAD_LOG_TAG} ${treadLogTime()} ${message}`;
  if (data === undefined) console.log(line);
  else console.log(line, JSON.stringify(data));
}

/** Rounds to 3 decimals for logs. */
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
