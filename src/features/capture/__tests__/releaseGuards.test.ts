// Release builds (__DEV__ false) must not be able to simulate captures,
// seed demo inspections, or use the demo analyzer.

declare const global: { __DEV__: boolean };

function inRelease<T>(load: () => T): T {
  const previous = global.__DEV__;
  global.__DEV__ = false;
  try {
    let result!: T;
    jest.isolateModules(() => {
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

test('release builds only get the real analyzer, which refuses to run without models', async () => {
  const analyzer = inRelease(() => require('../../../ml').getAnalyzer());
  expect(analyzer.isDemo).toBe(false);
  await expect(analyzer.load()).rejects.toThrow(/models are missing/);
});

test('in development the simulation is available and labelled by its demo:// paths', () => {
  const sim = require('../simulatedCapture');
  expect(sim.canSimulateCapture).toBe(true);
  const frames = sim.simulatedFrames('sidewall', 2);
  expect(frames.every((p: string) => sim.isSimulatedFrame(p))).toBe(true);
});
