import { absoluteFramePath } from '../features/capture/frameFiles';
import type { TyreResult } from '../features/inspection/types';
import { ModelUnavailableError, type AnalysisStep, type TyreAnalyzer } from './analyzer';
import { ANALYSIS_MODELS, hasAnalysisModels, modelManifest, type ModelManifest } from './manifest';
import {
  defaultModelLoaderDeps,
  loadModel,
  loadModels,
  type ModelLoaderDeps,
} from './inference/modelLoader';
import { runTyrePipeline, type PipelineDeps } from './inference/pipeline';
import type { ImageDecoder } from './inference/tensorUtils';
import type { AnalysisModels } from './inference/types';

export const UNCONFIGURED_VERSION = 'tflite-unconfigured';

/** Saved with each inspection, so results can be traced to the models that made them. */
export function tfliteVersion(manifest: ModelManifest): string {
  if (!hasAnalysisModels(manifest)) return UNCONFIGURED_VERSION;
  return `tflite:tread@${manifest.tread!.version},damage@${manifest.damage!.version}`;
}

function defaultPipelineDeps(): PipelineDeps {
  return {
    resolveFramePath: absoluteFramePath,
    get decoder(): ImageDecoder {
      // Loaded lazily, only once models are present and a tyre is analysed.
      const { Images } = require('react-native-nitro-image') as typeof import('react-native-nitro-image');
      return Images as unknown as ImageDecoder;
    },
  };
}

/**
 * Real on-device analyzer. Loads the tread and damage models through the safe
 * loader; if any is missing or can't be opened it throws
 * `ModelUnavailableError`, which keeps the tyre as `Analysis pending`.
 * A failed load is retried on the next `load()` (the screen's `Try again`).
 */
export class TfliteTyreAnalyzer implements TyreAnalyzer {
  readonly version: string;
  readonly isDemo = false;
  private models: AnalysisModels | null = null;
  private loading: Promise<AnalysisModels> | null = null;

  constructor(
    private readonly manifest: ModelManifest = modelManifest,
    private readonly loaderDeps: () => ModelLoaderDeps = defaultModelLoaderDeps,
    private readonly pipelineDeps: () => PipelineDeps = defaultPipelineDeps,
  ) {
    this.version = tfliteVersion(manifest);
  }

  async load(): Promise<void> {
    if (this.models) return;
    this.loading ??= this.loadAll().finally(() => {
      this.loading = null;
    });
    this.models = await this.loading;
  }

  private async loadAll(): Promise<AnalysisModels> {
    const { models, failures } = await loadModels(ANALYSIS_MODELS, this.manifest, this.loaderDeps());
    if (failures.length > 0 || !models.tread || !models.damage) {
      const missing = failures.every(
        f => f.reason === 'not_in_manifest' || f.reason === 'asset_missing',
      );
      throw new ModelUnavailableError(missing ? 'missing' : 'load_failed', failures);
    }
    // Optional: if the text detector is missing or won't open, analysis
    // still runs; the sidewall just has no text regions.
    const text = await loadModel('sidewallTextDetector', this.manifest, this.loaderDeps());
    return {
      tread: models.tread,
      damage: models.damage,
      ...(text.ok ? { sidewallText: text.model } : {}),
    };
  }

  async analyse(
    input: { sidewallFrames: string[]; treadFrames: string[]; userDetails: Partial<TyreResult> },
    onStep: (step: AnalysisStep) => void,
  ): Promise<TyreResult> {
    await this.load();
    return runTyrePipeline(this.models!, input, onStep, this.pipelineDeps());
  }
}
