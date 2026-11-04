import { useCallback, useEffect, useState } from 'react';
import { hasRoomForFrames } from './frameFiles';

/** Spec §8: check there's room before capturing; `recheck` after the user frees space. */
export function useStorageCheck() {
  const [enough, setEnough] = useState(true);
  const recheck = useCallback(async () => {
    const ok = await hasRoomForFrames();
    setEnough(ok);
    return ok;
  }, []);
  useEffect(() => {
    recheck();
  }, [recheck]);
  return { enough, recheck, markFull: useCallback(() => setEnough(false), []) };
}
