import type { TyreResult } from '../features/inspection/types';
import { tyreStatus } from '../features/inspection/status';
import { parseDotAge, parseTyreSize } from './ocr/parsers';
import { AnalyzerUnavailableError, type AnalysisStep, type TyreAnalyzer } from './analyzer';

export const DEMO_ANALYZER_VERSION = 'demo-1';

/** Fixed demo tread depths, cycled per analysis. Not real measurements. */
const DEMO_DEPTHS_MM = [6.2, 3.4, 5.8, 1.6];

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Stand-in so the full UI can be exercised before real models exist. Every
 * result it makes is demo data and must be shown with a `Demo data` label.
 * It refuses to load unless allowed: development builds, or a staging Release
 * build with `diagnosticsConfig.allowDemoAnalyzerInRelease` (see createAnalyzer).
 */
export class DemoTyreAnalyzer implements TyreAnalyzer {
  version = DEMO_ANALYZER_VERSION;
  isDemo = true;
  private count = 0;

  constructor(
    /** Development build, or a staging build that opted in. */
    private readonly isDev: boolean = __DEV__,
    private readonly stepDelayMs = 700,
  ) {}

  async load(): Promise<void> {
    if (!this.isDev) {
      throw new AnalyzerUnavailableError('The demo analyzer is not available in release builds.');
    }
  }

  async analyse(
    input: { sidewallFrames: string[]; treadFrames: string[]; userDetails: Partial<TyreResult> },
    onStep: (step: AnalysisStep) => void,
  ): Promise<TyreResult> {
    await this.load();
    const details = input.userDetails;

    onStep('sidewall');
    await wait(this.stepDelayMs);
    // Sidewall values only come from what the user confirmed. Nothing is made up here.
    const size = details.size ?? null;
    const dotTin = details.dotTin ?? null;
    const parsedSize = size ? parseTyreSize(size) : null;
    const age = dotTin ? parseDotAge(dotTin) : null;

    onStep('tread');
    await wait(this.stepDelayMs);
    const treadDepthMm = DEMO_DEPTHS_MM[this.count++ % DEMO_DEPTHS_MM.length];

    onStep('damage');
    await wait(this.stepDelayMs);
    const damageFound = false;

    const ageYears = age?.ageYears ?? null;
    const status =
      tyreStatus({ treadClass: null, treadDepthMm, damageFound, ageYears }) ?? 'good';

    return {
      status,
      treadDepthMm,
      treadConfidence: null,
      wearPattern: 'Even',
      damageFound,
      damageConfidence: null,
      size: parsedSize?.value ?? size,
      rimInches: parsedSize?.rimInches ?? null,
      make: details.make ?? null,
      model: details.model ?? null,
      dotTin,
      ageYears,
      ageMonths: age?.ageMonths ?? null,
    };
  }
}
