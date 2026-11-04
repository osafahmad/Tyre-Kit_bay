import { devConfig } from '../../config/dev';

/**
 * Development only: stands in for the camera until real capture exists (M5)
 * and on simulators without a camera. Frames are placeholders, not images.
 */
export const canSimulateCapture = devConfig.simulateCapture;

export function simulatedFrames(stage: 'sidewall' | 'tread', count: number): string[] {
  if (!canSimulateCapture) return [];
  return Array.from({ length: count }, (_, i) => `demo://${stage}/${i + 1}`);
}

export function isSimulatedFrame(path: string): boolean {
  return path.startsWith('demo://');
}
