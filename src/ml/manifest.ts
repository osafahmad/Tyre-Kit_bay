/**
 * Model manifest (spec §7). Every value must come from the training output.
 * Nothing is filled in until the owner provides the real .tflite files and
 * their input/output details. Don't guess these.
 */
export type ModelManifestEntry = {
  file: number; // require('../../assets/models/…tflite')
  version: string;
  inputShape: number[];
  inputType: 'uint8' | 'int8' | 'float32';
  normalisation: { mean: number[]; std: number[] } | null;
  labels: string[];
  outputFormat: string;
  confidenceThreshold: number;
};

export type ModelManifest = {
  tyreDetector: ModelManifestEntry | null;
  tread: ModelManifestEntry | null;
  damage: ModelManifestEntry | null;
};

export const modelManifest: ModelManifest = {
  tyreDetector: null,
  tread: null,
  damage: null,
};

export function missingModels(manifest: ModelManifest = modelManifest): string[] {
  return (Object.keys(manifest) as (keyof ModelManifest)[]).filter(k => manifest[k] === null);
}
