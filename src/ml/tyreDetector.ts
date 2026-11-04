import { modelManifest } from './manifest';

/**
 * Tyre detector (spec §7): position and distance during preview, ~10 fps.
 * Integration is M7 and needs the owner's trained model and manifest values.
 * Until then capture screens run without it: no distance messages, and
 * sidewall capture starts from the Capture button instead of automatically.
 */
export function isTyreDetectorAvailable(): boolean {
  return modelManifest.tyreDetector !== null;
}
