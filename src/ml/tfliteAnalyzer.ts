import { AnalyzerUnavailableError, type TyreAnalyzer } from './analyzer';
import { missingModels } from './manifest';

/**
 * Real on-device analyzer. Model integration is M7 and waits for the owner's
 * trained models and manifest values. Until then it fails clearly instead of
 * producing anything.
 */
export class TfliteTyreAnalyzer implements TyreAnalyzer {
  version = 'tflite-unconfigured';
  isDemo = false;

  async load(): Promise<void> {
    const missing = missingModels();
    if (missing.length > 0) {
      throw new AnalyzerUnavailableError(
        `Tyre models are missing from this build (${missing.join(', ')}).`,
      );
    }
    throw new AnalyzerUnavailableError('Tyre model integration is not built yet.');
  }

  async analyse(): Promise<never> {
    throw new AnalyzerUnavailableError('Tyre models are not loaded.');
  }
}
