import {
  CachesDirectoryPath,
  DocumentDirectoryPath,
  exists,
  getFSInfo,
  mkdir,
  moveFile,
  readDir,
  unlink,
} from '@dr.pogodin/react-native-fs';
import { inspectionConfig } from '../../config/inspection';
import { captureConfig } from '../../config/capture';
import type { Inspection, TyreInspection } from '../inspection/types';

// Captured frames live in app-private storage and never leave the phone.
// Paths saved in inspections are relative to the documents folder, because the
// absolute app container path changes between app updates on iOS.

export type CaptureStage = 'sidewall' | 'tread';

const FRAMES = 'frames';
const tempDir = () => `${CachesDirectoryPath}/capture-tmp`;

export const LOW_STORAGE_MESSAGE =
  "There isn't enough storage to save these frames. Free up some space and try again.";

export class LowStorageError extends Error {
  constructor() {
    super(LOW_STORAGE_MESSAGE);
    this.name = 'LowStorageError';
  }
}

const isDemo = (p: string) => p.startsWith('demo://');

export function absoluteFramePath(relative: string): string {
  return isDemo(relative) ? relative : `${DocumentDirectoryPath}/${relative}`;
}

const tyreDir = (inspectionId: string, tyreId: string) => `${FRAMES}/${inspectionId}/${tyreId}`;

/** Where a candidate frame is written before it's kept or thrown away. */
export async function newTempFramePath(): Promise<string> {
  await mkdir(tempDir());
  return `${tempDir()}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
}

/** Spec §8: refuse to start capturing when the phone is nearly full. */
export async function hasRoomForFrames(minFree = captureConfig.minFreeBytes): Promise<boolean> {
  try {
    const { freeSpace } = await getFSInfo();
    return freeSpace >= minFree;
  } catch {
    return true; // Unknown: let the write itself fail and report it.
  }
}

export async function deleteQuietly(paths: string[]) {
  await Promise.all(paths.filter(p => !isDemo(p)).map(p => unlink(p).catch(() => {})));
}

/**
 * Moves the kept candidates into the tyre's folder, replacing that stage's
 * earlier frames. Returns the new relative paths.
 */
export async function commitStageFrames(
  inspectionId: string,
  tyreId: string,
  stage: CaptureStage,
  tempPaths: string[],
): Promise<string[]> {
  if (tempPaths.length > 0 && tempPaths.every(isDemo)) return tempPaths;
  const dir = tyreDir(inspectionId, tyreId);
  await mkdir(`${DocumentDirectoryPath}/${dir}`);
  await deleteStageFrames(inspectionId, tyreId, stage);
  const stamp = Date.now();
  const kept: string[] = [];
  try {
    for (let i = 0; i < tempPaths.length; i++) {
      const relative = `${dir}/${stage}_${stamp}_${i + 1}.jpg`;
      await moveFile(tempPaths[i], absoluteFramePath(relative));
      kept.push(relative);
    }
  } catch (e) {
    await deleteQuietly([...tempPaths, ...kept.map(absoluteFramePath)]);
    throw isNoSpace(e) ? new LowStorageError() : e;
  }
  return kept;
}

export function isNoSpace(e: unknown): boolean {
  return /no space|ENOSPC|disk full|not enough space/i.test(String((e as Error)?.message ?? e));
}

async function deleteMatching(dir: string, prefix: string) {
  const abs = `${DocumentDirectoryPath}/${dir}`;
  if (!(await exists(abs))) return;
  const items = await readDir(abs);
  await deleteQuietly(items.filter(i => i.name.startsWith(prefix)).map(i => i.path));
}

export async function deleteStageFrames(inspectionId: string, tyreId: string, stage: CaptureStage) {
  await deleteMatching(tyreDir(inspectionId, tyreId), `${stage}_`);
}

export async function deleteTyreFrames(inspectionId: string, tyreId: string) {
  await unlink(`${DocumentDirectoryPath}/${tyreDir(inspectionId, tyreId)}`).catch(() => {});
}

export async function deleteInspectionFrames(inspectionId: string) {
  await unlink(`${DocumentDirectoryPath}/${FRAMES}/${inspectionId}`).catch(() => {});
}

/** Candidate frames left over from an interrupted capture. */
export async function clearTempFrames() {
  await unlink(tempDir()).catch(() => {});
}

/**
 * At startup: drop references to frames that are gone, step tyres back to the
 * stage that needs capturing again, and delete folders of inspections that no
 * longer exist.
 */
export async function reconcileFrames(inspections: Inspection[]): Promise<Inspection[]> {
  const { sidewallMinFrames, treadMinFrames } = inspectionConfig.capture;
  const present = async (paths: string[]) => {
    const checks = await Promise.all(
      paths.map(async p => (isDemo(p) || (await exists(absoluteFramePath(p)).catch(() => false)) ? p : null)),
    );
    return checks.filter((p): p is string => p !== null);
  };

  const result: Inspection[] = [];
  for (const inspection of inspections) {
    const tyres: TyreInspection[] = [];
    for (const tyre of inspection.tyres) {
      const sidewallFrames = await present(tyre.sidewallFrames);
      const treadFrames = await present(tyre.treadFrames);
      let state = tyre.state;
      if (state === 'capturing_tread' && sidewallFrames.length < sidewallMinFrames) {
        state = 'capturing_sidewall';
      }
      if ((state === 'captured' || state === 'analysing' || state === 'failed' ||
           state === 'pending_analysis') &&
          (sidewallFrames.length < sidewallMinFrames || treadFrames.length < treadMinFrames)) {
        state = sidewallFrames.length < sidewallMinFrames ? 'capturing_sidewall' : 'capturing_tread';
      }
      const changed =
        state !== tyre.state ||
        sidewallFrames.length !== tyre.sidewallFrames.length ||
        treadFrames.length !== tyre.treadFrames.length;
      tyres.push(changed ? { ...tyre, state, sidewallFrames, treadFrames } : tyre);
    }
    result.push(tyres.every((t, i) => t === inspection.tyres[i]) ? inspection : { ...inspection, tyres });
  }

  // Folders for inspections that were deleted.
  try {
    const root = `${DocumentDirectoryPath}/${FRAMES}`;
    if (await exists(root)) {
      const ids = new Set(inspections.map(i => i.id));
      const dirs = await readDir(root);
      await deleteQuietly(dirs.filter(d => !ids.has(d.name)).map(d => d.path));
    }
  } catch {
    // Cleanup is best effort.
  }
  return result;
}
