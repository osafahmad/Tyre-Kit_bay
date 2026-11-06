import type { TyreAnalyzer } from './analyzer';
import { DemoTyreAnalyzer, DEMO_ANALYZER_VERSION } from './demoAnalyzer';
import { hasAnalysisModels, modelManifest, type ModelManifest } from './manifest';
import { TfliteTyreAnalyzer } from './tfliteAnalyzer';

export type { TyreAnalyzer, AnalysisStep } from './analyzer';
export { AnalyzerUnavailableError, ModelUnavailableError } from './analyzer';

let instance: TyreAnalyzer | null = null;

/**
 * Release builds only ever get the real analyzer, which reports missing
 * models clearly. Development builds use the demo analyzer until the tread
 * and damage models are in the manifest, then the real one.
 */
export function createAnalyzer(
  isDev: boolean = __DEV__,
  manifest: ModelManifest = modelManifest,
): TyreAnalyzer {
  if (!isDev || hasAnalysisModels(manifest)) {
    return new TfliteTyreAnalyzer(manifest);
  }
  return new DemoTyreAnalyzer(isDev);
}

export function getAnalyzer(): TyreAnalyzer {
  instance ??= createAnalyzer();
  return instance;
}

export function isDemoVersion(analyzerVersion: string): boolean {
  return analyzerVersion === DEMO_ANALYZER_VERSION || analyzerVersion.startsWith('demo');
}
