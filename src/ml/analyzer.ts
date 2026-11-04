import type { TyreResult } from '../features/inspection/types';

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

export class AnalyzerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyzerUnavailableError';
  }
}
