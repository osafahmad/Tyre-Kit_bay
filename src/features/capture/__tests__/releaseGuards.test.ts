// Release builds (__DEV__ false) must not be able to simulate captures or
// seed demo inspections. Store builds (staging flag off) must not use the demo
// analyzer; staging builds may, and their results are labelled as demo.

declare const global: { __DEV__: boolean };

function inRelease<T>(load: () => T, allowDemoAnalyzerInRelease?: boolean): T {
  const previous = global.__DEV__;
  global.__DEV__ = false;
  try {
    let result!: T;
    jest.isolateModules(() => {
      if (allowDemoAnalyzerInRelease !== undefined) {
        const real = jest.requireActual('../../../config/diagnostics');
        jest.doMock('../../../config/diagnostics', () => ({
          diagnosticsConfig: { ...real.diagnosticsConfig, allowDemoAnalyzerInRelease },
        }));
      }
      result = load();
    });
    return result;
  } finally {
    global.__DEV__ = previous;
  }
}

test('no simulated capture or demo seeding in release', () => {
  const { devConfig } = inRelease(() => require('../../../config/dev'));
  expect(devConfig.simulateCapture).toBe(false);
  expect(devConfig.seedDemoInspections).toBe(false);

  const sim = inRelease(() => require('../simulatedCapture'));
  expect(sim.canSimulateCapture).toBe(false);
  expect(sim.simulatedFrames('tread', 10)).toEqual([]);
});

test('store release builds only get the real analyzer, which refuses to run without models', async () => {
  const analyzer = inRelease(() => require('../../../ml').getAnalyzer(), false);
  expect(analyzer.isDemo).toBe(false);
  await expect(analyzer.load()).rejects.toThrow(/models are missing/);
});

test('staging release builds get the demo analyzer, whose version marks results as Demo data', async () => {
  const ml = inRelease(() => require('../../../ml'), true);
  const analyzer = ml.getAnalyzer();
  expect(analyzer.isDemo).toBe(true);
  expect(ml.isDemoVersion(analyzer.version)).toBe(true);
  await expect(analyzer.load()).resolves.toBeUndefined();
});

test('release builds never log sidewall OCR text', () => {
  const release = inRelease(() => {
    const { diagnosticsConfig } = require('../../../config/diagnostics');
    const debug = require('../../../ml/ocr/sidewallDebug');
    debug.setSidewallDebug(diagnosticsConfig.sidewallOcrLogs);
    return { flag: diagnosticsConfig.sidewallOcrLogs, debug };
  });
  expect(release.flag).toBe(false);
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  release.debug.sidewallLog('ML Kit raw text', { lines: ['195/55 R15'] });
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});

test('the staging flag never turns on capture simulation', () => {
  const sim = inRelease(() => require('../simulatedCapture'), true);
  expect(sim.canSimulateCapture).toBe(false);
});

test('in development the simulation is available and labelled by its demo:// paths', () => {
  const sim = require('../simulatedCapture');
  expect(sim.canSimulateCapture).toBe(true);
  const frames = sim.simulatedFrames('sidewall', 2);
  expect(frames.every((p: string) => sim.isSimulatedFrame(p))).toBe(true);
});
