/**
 * Starting defaults from TYRE_KIT_BAY_SPEC.md §5. Not legal or safety advice.
 * The owner must confirm these before release.
 */
export const inspectionConfig = {
  tread: { replaceNowMaxMm: 1.6, replaceSoonMaxMm: 4.0 },
  age: { replaceSoonYears: 6 },
  capture: {
    sidewallMinFrames: 5,
    sidewallTargetFrames: 8,
    treadMinFrames: 5,
    treadTargetFrames: 10,
    timeoutSeconds: 20,
  },
};
