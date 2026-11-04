import { createMMKV } from 'react-native-mmkv';

/** Small on-device key-value settings. Inspection data lives in SQLite. */
const storage = createMMKV({ id: 'settings' });

const HAS_SEEN_WALKTHROUGH = 'hasSeenWalkthrough';
const CURRENT_INSPECTION = 'currentInspectionId';

export const settings = {
  hasSeenWalkthrough(): boolean {
    return storage.getBoolean(HAS_SEEN_WALKTHROUGH) ?? false;
  },
  setHasSeenWalkthrough(value: boolean) {
    storage.set(HAS_SEEN_WALKTHROUGH, value);
  },
  /** The unfinished inspection to offer on Home after a restart. */
  currentInspectionId(): string | null {
    return storage.getString(CURRENT_INSPECTION) ?? null;
  },
  setCurrentInspectionId(id: string | null) {
    if (id === null) storage.remove(CURRENT_INSPECTION);
    else storage.set(CURRENT_INSPECTION, id);
  },
};
