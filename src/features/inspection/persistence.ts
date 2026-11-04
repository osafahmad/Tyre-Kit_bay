import type { InspectionRepository } from './repository';
import { useInspectionStore } from './store';
import { settings } from './settings';
import { clearTempFrames, reconcileFrames } from '../capture/frameFiles';
import type { Inspection } from './types';

/**
 * Loads saved inspections into the store, then saves every change made after
 * that, so a closed app can resume where it left off.
 */
export async function startPersistence(repo: InspectionRepository): Promise<() => void> {
  // Frames that vanished (or never finished saving) send their tyre back to that step.
  const loaded = await repo.loadAll();
  const inspections = await reconcileFrames(loaded);
  await clearTempFrames().catch(() => {});
  const savedCurrent = settings.currentInspectionId();
  const current =
    savedCurrent && inspections.some(i => i.id === savedCurrent && i.completedAt === null)
      ? savedCurrent
      : null;
  useInspectionStore.getState().replaceAll(inspections, current);

  // Writes run one after another so a later save can't be overtaken by an earlier one.
  let queue = Promise.resolve();
  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(job).catch(() => {
      // A failed write is retried on the next change to the same inspection.
    });
  };

  let previous = new Map<string, Inspection>(inspections.map(i => [i.id, i]));
  inspections.forEach((inspection, i) => {
    if (inspection !== loaded[i]) enqueue(() => repo.save(inspection));
  });
  return useInspectionStore.subscribe(state => {
    if (state.currentId !== settings.currentInspectionId()) {
      settings.setCurrentInspectionId(state.currentId);
    }
    const next = new Map(state.inspections.map(i => [i.id, i]));
    for (const [id, inspection] of next) {
      if (previous.get(id) !== inspection) enqueue(() => repo.save(inspection));
    }
    for (const id of previous.keys()) {
      if (!next.has(id)) enqueue(() => repo.remove(id));
    }
    previous = next;
  });
}
