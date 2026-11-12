import {
  DEBUG_LOG_CAPACITY,
  DEBUG_LOG_MAX_LINE,
  clearDebugLogs,
  getDebugLogCount,
  getDebugLogsText,
  recordDebugLog,
  setDebugLogBuffer,
} from '../debugLogBuffer';
import { setSidewallDebug, sidewallLog } from '../../ml/ocr/sidewallDebug';
import { isTreadDebugEnabled, setTreadDebug, treadLog } from '../../ml/services/treadDebug';
import { diagnosticsConfig } from '../../config/diagnostics';

afterEach(() => {
  setDebugLogBuffer(false);
  setSidewallDebug(false);
  setTreadDebug(false);
});

test('off: nothing is kept', () => {
  recordDebugLog('a');
  expect(getDebugLogCount()).toBe(0);
});

test('keeps the last 300 lines, oldest first', () => {
  setDebugLogBuffer(true);
  for (let i = 1; i <= DEBUG_LOG_CAPACITY + 5; i++) recordDebugLog(`line ${i}`);
  expect(getDebugLogCount()).toBe(DEBUG_LOG_CAPACITY);
  const text = getDebugLogsText().split('\n');
  expect(text[0]).toBe('line 6');
  expect(text[text.length - 1]).toBe(`line ${DEBUG_LOG_CAPACITY + 5}`);
  clearDebugLogs();
  expect(getDebugLogsText()).toBe('');
  recordDebugLog('after clear');
  expect(getDebugLogsText()).toBe('after clear');
});

test('very long lines are cut', () => {
  setDebugLogBuffer(true);
  recordDebugLog('x'.repeat(DEBUG_LOG_MAX_LINE + 50));
  expect(getDebugLogsText().length).toBeLessThan(DEBUG_LOG_MAX_LINE + 20);
});

test('staging: both loggers record to the buffer with the console off', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  setDebugLogBuffer(true);
  sidewallLog('read start', { frames: 3 });
  treadLog('sweep:', { travel: 0.5 });
  expect(log).not.toHaveBeenCalled();
  expect(isTreadDebugEnabled()).toBe(true);
  const [side, tread] = getDebugLogsText().split('\n');
  expect(side).toMatch(/^\[SidewallOCR\] \d\d:\d\d:\d\d\.\d{3} read start \{"frames":3\}$/);
  expect(tread).toMatch(/^\[TreadWear\] \d\d:\d\d:\d\d\.\d{3} sweep: \{"travel":0.5\}$/);
  log.mockRestore();
});

test('the console still logs when its own flag is on', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  setTreadDebug(true);
  treadLog('x');
  expect(log).toHaveBeenCalledTimes(1);
  expect(getDebugLogCount()).toBe(0);
  log.mockRestore();
});

test('the flag is documented as staging only', () => {
  expect(typeof diagnosticsConfig.enableStagingLogs).toBe('boolean');
});
