import { create } from 'zustand';
import {
  deleteInspectionFrames,
  deleteTyreFrames,
} from '../capture/frameFiles';
import { useShallow } from 'zustand/react/shallow';
import type {
  CaptureErrorReason,
  Inspection,
  SidewallDetails,
  TyreInspection,
  TyreResult,
} from './types';

export const emptySidewallDetails: SidewallDetails = {
  size: null,
  dotTin: null,
  make: null,
  model: null,
};

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function newTyre(position: string): TyreInspection {
  return {
    id: newId('tyre'),
    position,
    state: 'waiting',
    sidewallFrames: [],
    treadFrames: [],
    result: null,
    errorReason: null,
    sidewallDetails: emptySidewallDetails,
  };
}

/** The tyre to scan next: first one not finished or skipped, in scan order. */
export function nextTyre(inspection: Inspection): TyreInspection | null {
  return inspection.tyres.find(t => t.state !== 'done' && t.state !== 'skipped') ?? null;
}

export function analysedTyres(inspection: Inspection): TyreInspection[] {
  return inspection.tyres.filter(t => t.state === 'done' && t.result !== null);
}

type State = {
  inspections: Inspection[];
  /** Unfinished inspection the user is working on, if any. */
  currentId: string | null;
};

type Actions = {
  startInspection(analyzerVersion: string): string;
  setVehicle(patch: { plate?: string | null; chassis?: string | null }): void;
  selectTyres(positions: string[]): void;
  updateTyre(tyreId: string, patch: Partial<TyreInspection>): void;
  setSidewallCaptured(tyreId: string, frames: string[], details: SidewallDetails): void;
  setSidewallDetails(tyreId: string, details: SidewallDetails): void;
  setTreadCaptured(tyreId: string, frames: string[]): void;
  setCaptureProblem(tyreId: string, reason: CaptureErrorReason): void;
  skipTyre(tyreId: string): void;
  setResult(tyreId: string, result: TyreResult): void;
  setAnalysisFailed(tyreId: string): void;
  /** Restart a tyre's capture (Scan this tyre again). */
  resetTyre(tyreId: string): void;
  completeInspection(): string | null;
  /** Keep the unfinished inspection and leave (Save and leave). */
  leaveInspection(): void;
  discardInspection(id: string): void;
  resumeInspection(id: string): void;
  replaceAll(inspections: Inspection[], currentId: string | null): void;
};

export type InspectionStore = State & Actions;

export const useInspectionStore = create<InspectionStore>()((set, get) => {
  const patchCurrent = (fn: (i: Inspection) => Inspection) =>
    set(state => ({
      inspections: state.inspections.map(i => (i.id === state.currentId ? fn(i) : i)),
    }));

  const patchTyre = (tyreId: string, fn: (t: TyreInspection) => TyreInspection) =>
    set(state => ({
      inspections: state.inspections.map(i =>
        i.tyres.some(t => t.id === tyreId)
          ? { ...i, tyres: i.tyres.map(t => (t.id === tyreId ? fn(t) : t)) }
          : i,
      ),
    }));

  return {
    inspections: [],
    currentId: null,

    startInspection(analyzerVersion) {
      const inspection: Inspection = {
        id: newId('insp'),
        createdAt: new Date().toISOString(),
        completedAt: null,
        plate: null,
        chassis: null,
        tyres: [],
        reportPath: null,
        analyzerVersion,
      };
      set(state => ({ inspections: [inspection, ...state.inspections], currentId: inspection.id }));
      return inspection.id;
    },

    setVehicle(patch) {
      patchCurrent(i => ({ ...i, ...patch }));
    },

    selectTyres(positions) {
      patchCurrent(i => {
        // Keep work already done on positions that stay selected.
        const existing = new Map(i.tyres.map(t => [t.position, t]));
        return { ...i, tyres: positions.map(p => existing.get(p) ?? newTyre(p)) };
      });
    },

    updateTyre(tyreId, patch) {
      patchTyre(tyreId, t => ({ ...t, ...patch }));
    },

    setSidewallCaptured(tyreId, frames, details) {
      patchTyre(tyreId, t => ({
        ...t,
        state: 'capturing_tread',
        sidewallFrames: frames,
        sidewallDetails: details,
        errorReason: null,
      }));
    },

    setSidewallDetails(tyreId, details) {
      patchTyre(tyreId, t => ({ ...t, sidewallDetails: details }));
    },

    setTreadCaptured(tyreId, frames) {
      patchTyre(tyreId, t => ({ ...t, state: 'captured', treadFrames: frames, errorReason: null }));
    },

    setCaptureProblem(tyreId, reason) {
      patchTyre(tyreId, t => ({ ...t, errorReason: reason }));
    },

    skipTyre(tyreId) {
      const found = findTyre(get().inspections, tyreId);
      if (found) deleteTyreFrames(found.inspection.id, tyreId).catch(() => {});
      patchTyre(tyreId, t => ({
        ...t,
        state: 'skipped',
        result: null,
        sidewallFrames: [],
        treadFrames: [],
      }));
    },

    setResult(tyreId, result) {
      patchTyre(tyreId, t => ({ ...t, state: 'done', result, errorReason: null }));
    },

    setAnalysisFailed(tyreId) {
      patchTyre(tyreId, t => ({ ...t, state: 'failed', errorReason: 'analysis_failed' }));
    },

    resetTyre(tyreId) {
      const found = findTyre(get().inspections, tyreId);
      if (found) deleteTyreFrames(found.inspection.id, tyreId).catch(() => {});
      patchTyre(tyreId, t => ({
        ...newTyre(t.position),
        id: t.id,
        state: 'capturing_sidewall',
      }));
    },

    completeInspection() {
      const id = get().currentId;
      patchCurrent(i => ({ ...i, completedAt: new Date().toISOString() }));
      set({ currentId: null });
      return id;
    },

    leaveInspection() {
      // The inspection stays saved and unfinished; Home offers Continue inspection.
    },

    discardInspection(id) {
      deleteInspectionFrames(id).catch(() => {});
      set(state => ({
        inspections: state.inspections.filter(i => i.id !== id),
        currentId: state.currentId === id ? null : state.currentId,
      }));
    },

    resumeInspection(id) {
      set({ currentId: id });
    },

    replaceAll(inspections, currentId) {
      set({ inspections, currentId });
    },
  };
});

export function useCurrentInspection(): Inspection | null {
  return useInspectionStore(s => s.inspections.find(i => i.id === s.currentId) ?? null);
}

export function useInspection(id: string | undefined): Inspection | null {
  return useInspectionStore(s => s.inspections.find(i => i.id === id) ?? null);
}

export function findTyre(
  inspections: Inspection[],
  tyreId: string,
): { inspection: Inspection; tyre: TyreInspection; index: number } | null {
  for (const inspection of inspections) {
    const index = inspection.tyres.findIndex(t => t.id === tyreId);
    if (index >= 0) return { inspection, tyre: inspection.tyres[index], index };
  }
  return null;
}

export function useTyre(tyreId: string) {
  const found = useInspectionStore(
    useShallow(s => findTyre(s.inspections, tyreId) ?? { inspection: null, tyre: null, index: -1 }),
  );
  return found.inspection && found.tyre
    ? { inspection: found.inspection, tyre: found.tyre, index: found.index }
    : null;
}

/** Finished inspections, newest first. */
export function useSavedInspections(): Inspection[] {
  return useInspectionStore(useShallow(s => s.inspections.filter(i => i.completedAt !== null)));
}
