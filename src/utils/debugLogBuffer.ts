/**
 * Offline log collector for staging builds (owner request 2026-11-12: testing
 * on a car in an underground car park, Release build, no Metro or console).
 *
 * Keeps the last `DEBUG_LOG_CAPACITY` formatted `[SidewallOCR]` and
 * `[TreadWear]` lines in memory, so they can be copied to the clipboard
 * ("Copy logs" on Tyre result and Sidewall captured). On only when
 * `diagnosticsConfig.enableStagingLogs` is true (index.js). Nothing is written
 * to disk or sent anywhere: the lines are gone when the app closes, and they
 * leave the phone only when the user copies and pastes them.
 *
 * `[SidewallOCR]` lines include raw ML Kit text of sidewall frames, so the flag
 * MUST be off for store builds (docs/RELEASE_CHECKLIST.md).
 */

export const DEBUG_LOG_CAPACITY = 300;
/** Longest line kept, so one huge JSON payload can't fill the clipboard. */
export const DEBUG_LOG_MAX_LINE = 4000;

let enabled = false;
const lines: string[] = [];
let start = 0;

export function setDebugLogBuffer(on: boolean): void {
  enabled = on;
  if (!on) clearDebugLogs();
}

export function isDebugLogBufferEnabled(): boolean {
  return enabled;
}

/** Adds one formatted line; the oldest is dropped once `DEBUG_LOG_CAPACITY` are held. */
export function recordDebugLog(line: string): void {
  if (!enabled) return;
  const kept = line.length > DEBUG_LOG_MAX_LINE ? `${line.slice(0, DEBUG_LOG_MAX_LINE)}… (cut)` : line;
  if (lines.length < DEBUG_LOG_CAPACITY) lines.push(kept);
  else {
    lines[start] = kept;
    start = (start + 1) % DEBUG_LOG_CAPACITY;
  }
}

export function getDebugLogCount(): number {
  return lines.length;
}

/** The buffered lines, oldest first, one per line. */
export function getDebugLogsText(): string {
  return [...lines.slice(start), ...lines.slice(0, start)].join('\n');
}

export function clearDebugLogs(): void {
  lines.length = 0;
  start = 0;
}

/** `HH:MM:SS.mmm`, local time. */
export function logTime(date: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}`;
}
