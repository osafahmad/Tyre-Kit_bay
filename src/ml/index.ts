import type { TyreAnalyzer } from './analyzer';
import { DemoTyreAnalyzer, DEMO_ANALYZER_VERSION } from './demoAnalyzer';
import { TfliteTyreAnalyzer } from './tfliteAnalyzer';

export type { TyreAnalyzer, AnalysisStep } from './analyzer';
export { AnalyzerUnavailableError } from './analyzer';

let instance: TyreAnalyzer | null = null;

/**
 * Development builds use the demo analyzer until real models are bundled.
 * Release builds only ever get the real analyzer, which fails clearly if
 * models are missing.
 */
export function createAnalyzer(isDev: boolean = __DEV__): TyreAnalyzer {
  return isDev ? new DemoTyreAnalyzer(isDev) : new TfliteTyreAnalyzer();
}

export function getAnalyzer(): TyreAnalyzer {
  instance ??= createAnalyzer();
  return instance;
}

export function isDemoVersion(analyzerVersion: string): boolean {
  return analyzerVersion === DEMO_ANALYZER_VERSION || analyzerVersion.startsWith('demo');
}
