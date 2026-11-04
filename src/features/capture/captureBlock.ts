import { create } from 'zustand';

/**
 * Set while a dialog covers a capture screen (e.g. `Leave this inspection?`),
 * so frames aren't accepted and the capture timeout doesn't run behind it.
 */
export const useCaptureBlock = create<{ blocked: boolean; setBlocked: (b: boolean) => void }>(
  set => ({ blocked: false, setBlocked: blocked => set({ blocked }) }),
);
