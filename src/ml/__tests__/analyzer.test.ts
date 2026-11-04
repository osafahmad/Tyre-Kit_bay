import { createAnalyzer } from '..';
import { DemoTyreAnalyzer } from '../demoAnalyzer';
import { TfliteTyreAnalyzer } from '../tfliteAnalyzer';
import { AnalyzerUnavailableError } from '../analyzer';

test('release builds never get the demo analyzer', () => {
  const analyzer = createAnalyzer(false);
  expect(analyzer).toBeInstanceOf(TfliteTyreAnalyzer);
  expect(analyzer.isDemo).toBe(false);
});

test('demo analyzer cannot load in release mode', async () => {
  await expect(new DemoTyreAnalyzer(false).load()).rejects.toBeInstanceOf(AnalyzerUnavailableError);
  await expect(
    new DemoTyreAnalyzer(false, 0).analyse(
      { sidewallFrames: [], treadFrames: [], userDetails: {} },
      () => {},
    ),
  ).rejects.toBeInstanceOf(AnalyzerUnavailableError);
});

test('real analyzer fails clearly while models are missing', async () => {
  await expect(new TfliteTyreAnalyzer().load()).rejects.toThrow(/models are missing/);
});

test('development builds use the demo analyzer, flagged as demo', () => {
  const analyzer = createAnalyzer(true);
  expect(analyzer.isDemo).toBe(true);
  expect(analyzer.version).toMatch(/^demo/);
});

test('demo analyzer only uses sidewall values the user confirmed', async () => {
  const steps: string[] = [];
  const result = await new DemoTyreAnalyzer(true, 0).analyse(
    { sidewallFrames: [], treadFrames: [], userDetails: { size: '215/65r15', dotTin: null } },
    s => steps.push(s),
  );
  expect(steps).toEqual(['sidewall', 'tread', 'damage']);
  expect(result.size).toBe('215/65 R15');
  expect(result.rimInches).toBe(15);
  expect(result.make).toBeNull();
  expect(result.dotTin).toBeNull();
  expect(result.ageYears).toBeNull();
});
