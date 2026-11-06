import type { TyreResult } from '../features/inspection/types';
import type { ModelLoadFailure } from './inference/types';

// Analyzer contract from spec §6. Screens use this, never TFLite directly.

export type AnalysisStep = 'sidewall' | 'tread' | 'damage';

export interface TyreAnalyzer {
  version: string;
  isDemo: boolean;
  load(): Promise<void>;
  analyse(
    input: { sidewallFrames: string[]; treadFrames: string[]; userDetails: Partial<TyreResult> },
    onStep: (step: AnalysisStep) => void,
  ): Promise<TyreResult>;
}

/** No analysis is possible in this build. The tyre is kept as `Analysis pending`. */
export class AnalyzerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyzerUnavailableError';
  }
}

/**
 * The models are missing from the build (`missing`), or are bundled but
 * couldn't be opened or don't match the manifest (`load_failed`).
 */
export class ModelUnavailableError extends AnalyzerUnavailableError {
  constructor(
    readonly reason: 'missing' | 'load_failed',
    readonly failures: ModelLoadFailure[],
  ) {
    super(
      reason === 'missing'
        ? `Tyre models are missing from this build (${failures.map(f => f.key).join(', ')}).`
        : `Tyre models couldn't be loaded (${failures.map(f => `${f.key}: ${f.reason}`).join(', ')}).`,
    );
    this.name = 'ModelUnavailableError';
  }
}
