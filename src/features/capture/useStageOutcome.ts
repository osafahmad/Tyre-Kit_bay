import { useEffect, useRef } from 'react';
import type { CaptureOutcome } from './captureSession';
import { commitStageFrames, deleteQuietly, LowStorageError, type CaptureStage } from './frameFiles';
import { useInspectionStore } from '../inspection/store';
import type { CaptureErrorReason } from '../inspection/types';
import { feedback } from '../feedback/feedback';

/**
 * Acts once on a capture outcome: keeps the chosen frames in the tyre's folder
 * and saves their paths (so a restart resumes at the next step), or deletes
 * them and reports the problem.
 */
export function useStageOutcome({
  outcome,
  inspectionId,
  tyreId,
  stage,
  onSaved,
  onProblem,
  onSaveError,
}: {
  outcome: CaptureOutcome | null;
  inspectionId: string;
  tyreId: string;
  stage: CaptureStage;
  onSaved: () => void;
  onProblem: (reason: CaptureErrorReason) => void;
  onSaveError: (kind: 'storage' | 'other') => void;
}) {
  const handled = useRef(false);
  useEffect(() => {
    if (!outcome || handled.current) return;
    handled.current = true;
    (async () => {
      await deleteQuietly(outcome.discard);
      if (outcome.kind === 'problem') {
        useInspectionStore.getState().setCaptureProblem(tyreId, outcome.reason);
        feedback.warning();
        onProblem(outcome.reason);
        return;
      }
      try {
        const paths = await commitStageFrames(inspectionId, tyreId, stage, outcome.keep);
        const store = useInspectionStore.getState();
        if (stage === 'sidewall') {
          const tyre = store.inspections
            .find(i => i.id === inspectionId)
            ?.tyres.find(t => t.id === tyreId);
          store.setSidewallCaptured(tyreId, paths, tyre!.sidewallDetails);
          feedback.success('Sidewall captured');
        } else {
          store.setTreadCaptured(tyreId, paths);
        }
        onSaved();
      } catch (e) {
        // Frames that couldn't be moved were deleted; the user captures again.
        onSaveError(e instanceof LowStorageError ? 'storage' : 'other');
      }
    })();
  }, [outcome, inspectionId, tyreId, stage, onSaved, onProblem, onSaveError]);
}
