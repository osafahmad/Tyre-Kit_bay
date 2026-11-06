import type { TyreAnalyzer } from './analyzer';
import { DemoTyreAnalyzer, DEMO_ANALYZER_VERSION } from './demoAnalyzer';
import { hasAnalysisModels, modelManifest, type ModelManifest } from './manifest';
import { TfliteTyreAnalyzer } from './tfliteAnalyzer';
import { diagnosticsConfig } from '../config/diagnostics';

export type { TyreAnalyzer, AnalysisStep } from './analyzer';
export { AnalyzerUnavailableError, ModelUnavailableError } from './analyzer';

let instance: TyreAnalyzer | null = null;

/**
 * Once the tread and damage models are in the manifest, every build gets the
 * real analyzer. Until then, development builds use the demo analyzer, and
 * so do staging Release builds with `diagnosticsConfig.allowDemoAnalyzerInRelease`
 * (owner decision 2026-11-06). Store builds (flag off) get the real analyzer,
 * which reports the missing models clearly (`Analysis pending`).
 */
export function createAnalyzer(
  isDev: boolean = __DEV__,
  manifest: ModelManifest = modelManifest,
  allowDemoInRelease: boolean = diagnosticsConfig.allowDemoAnalyzerInRelease,
): TyreAnalyzer {
  if (hasAnalysisModels(manifest)) return new TfliteTyreAnalyzer(manifest);
  // Staging Release builds may opt in to the demo analyzer (labelled Demo data).
  if (isDev || allowDemoInRelease) return new DemoTyreAnalyzer(true);
  return new TfliteTyreAnalyzer(manifest);
}

export function getAnalyzer(): TyreAnalyzer {
  instance ??= createAnalyzer();
  return instance;
}

export function isDemoVersion(analyzerVersion: string): boolean {
  return analyzerVersion === DEMO_ANALYZER_VERSION || analyzerVersion.startsWith('demo');
}
