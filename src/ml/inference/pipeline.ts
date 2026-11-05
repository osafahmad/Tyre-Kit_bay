import type { TyreResult } from '../../features/inspection/types';
import { tyreStatus } from '../../features/inspection/status';
import { parseDotAge, parseTyreSize } from '../ocr/parsers';
import type { AnalysisStep } from '../analyzer';
import type { ClassifierManifestEntry } from '../manifest';
import {
  argmax,
  classifierProbabilities,
  imageFileToTensor,
  meanVectors,
  tensorSpecFromManifest,
  type ImageDecoder,
} from './tensorUtils';
import type {
  AnalysisModels,
  ClassifierOutput,
  DamageClassifier,
  DamageClassifierInput,
  DamageClassifierOutput,
  LoadedModel,
  SidewallExtractor,
  SidewallExtractorInput,
  SidewallExtractorOutput,
  TreadEstimator,
  TreadEstimatorInput,
  TreadEstimatorOutput,
} from './types';

/** A model ran but its answer can't be used. Shown as `This tyre couldn't be analysed.` */
export class AnalysisFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisFailedError';
  }
}

export type PipelineDeps = {
  /** Saved (relative) frame path → path the image decoder can open. */
  resolveFramePath(path: string): string;
  decoder: ImageDecoder;
};

/**
 * Runs one classifier over every frame it was trained on, one frame at a time,
 * and averages the probabilities.
 */
export async function classifyFrames(
  loaded: LoadedModel<ClassifierManifestEntry>,
  frames: string[],
  deps: PipelineDeps,
): Promise<ClassifierOutput> {
  if (frames.length === 0) {
    throw new AnalysisFailedError(`No frames for the ${loaded.key} model.`);
  }
  const spec = tensorSpecFromManifest(loaded.entry);
  const perFrame: Float32Array[] = [];
  for (const frame of frames) {
    let path = deps.resolveFramePath(frame);
    if (path.startsWith('file://')) path = decodeURI(path.slice('file://'.length));
    if (/^[a-z]+:\/\//i.test(path)) {
      // e.g. `demo://` frames from the development capture simulation.
      throw new AnalysisFailedError('Frame is not a saved file on this phone.');
    }
    const tensor = await imageFileToTensor(path, spec, deps.decoder);
    const [output] = await loaded.model.run([tensor]);
    if (!output) throw new AnalysisFailedError(`The ${loaded.key} model returned nothing.`);
    perFrame.push(classifierProbabilities(output, loaded.entry));
  }
  const scores = meanVectors(perFrame);
  const top = argmax(scores);
  return {
    scores,
    topLabel: loaded.entry.labels[top],
    topScore: scores[top],
    framesUsed: perFrame.length,
  };
}

function framesFor(
  entry: ClassifierManifestEntry,
  input: { sidewallFrames: string[]; treadFrames: string[] },
): string[] {
  if (entry.frames === 'sidewall') return input.sidewallFrames;
  if (entry.frames === 'tread') return input.treadFrames;
  return [...input.sidewallFrames, ...input.treadFrames];
}

/** Sidewall values come only from what the user confirmed (OCR + parsers). Nothing is guessed. */
export const confirmedSidewallExtractor: SidewallExtractor = {
  async extract({ userDetails }: SidewallExtractorInput): Promise<SidewallExtractorOutput> {
    const size = userDetails.size ?? null;
    const dotTin = userDetails.dotTin ?? null;
    const parsedSize = size ? parseTyreSize(size) : null;
    const age = dotTin ? parseDotAge(dotTin) : null;
    return {
      size: parsedSize?.value ?? size,
      rimInches: parsedSize?.rimInches ?? null,
      make: userDetails.make ?? null,
      model: userDetails.model ?? null,
      dotTin,
      ageYears: age?.ageYears ?? null,
      ageMonths: age?.ageMonths ?? null,
    };
  },
};

export function createTreadEstimator(
  loaded: AnalysisModels['tread'],
  deps: PipelineDeps,
): TreadEstimator {
  return {
    async estimate({ frames }: TreadEstimatorInput): Promise<TreadEstimatorOutput> {
      const out = await classifyFrames(loaded, frames, deps);
      if (out.topScore < loaded.entry.confidenceThreshold) {
        throw new AnalysisFailedError('Tread result is below the confidence threshold.');
      }
      return {
        status: loaded.entry.statusByLabel[out.topLabel],
        confidence: out.topScore,
        depthMm: null, // spec §7: mm output only after it matches gauge readings
        framesUsed: out.framesUsed,
      };
    },
  };
}

export function createDamageClassifier(
  loaded: AnalysisModels['damage'],
  deps: PipelineDeps,
): DamageClassifier {
  return {
    async classify({ frames }: DamageClassifierInput): Promise<DamageClassifierOutput> {
      const out = await classifyFrames(loaded, frames, deps);
      let damageScore = 0;
      loaded.entry.labels.forEach((label, i) => {
        if (loaded.entry.damageLabels.includes(label)) damageScore += out.scores[i];
      });
      const damageFound = damageScore >= loaded.entry.confidenceThreshold;
      return {
        damageFound,
        confidence: damageFound ? damageScore : 1 - damageScore,
        framesUsed: out.framesUsed,
      };
    },
  };
}

export type PipelineInput = {
  sidewallFrames: string[];
  treadFrames: string[];
  userDetails: Partial<TyreResult>;
};

/** After capture (spec §7): sidewall → tread → damage → combine. */
export async function runTyrePipeline(
  models: AnalysisModels,
  input: PipelineInput,
  onStep: (step: AnalysisStep) => void,
  deps: PipelineDeps,
): Promise<TyreResult> {
  onStep('sidewall');
  const sidewall = await confirmedSidewallExtractor.extract({
    frames: input.sidewallFrames,
    userDetails: input.userDetails,
  });

  onStep('tread');
  const tread = await createTreadEstimator(models.tread, deps).estimate({
    frames: framesFor(models.tread.entry, input),
  });

  onStep('damage');
  const damage = await createDamageClassifier(models.damage, deps).classify({
    frames: framesFor(models.damage.entry, input),
  });

  const status = tyreStatus({
    treadClass: tread.status,
    treadDepthMm: tread.depthMm,
    damageFound: damage.damageFound,
    ageYears: sidewall.ageYears,
  });
  if (!status) throw new AnalysisFailedError('No status could be worked out.');

  return {
    status,
    treadDepthMm: tread.depthMm,
    treadConfidence: tread.confidence,
    wearPattern: null, // no wear-pattern model yet
    damageFound: damage.damageFound,
    damageConfidence: damage.confidence,
    ...sidewall,
  };
}
