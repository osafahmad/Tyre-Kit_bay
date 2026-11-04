/** Development-only switches. All are off in release builds. */
export const devConfig = {
  /** Seed sample inspections (labelled Demo data) when there are none. For checking layouts. */
  seedDemoInspections: false,
  /**
   * Fake frame capture while there's no camera (simulator, or before M5).
   * Captures made this way are labelled Demo data.
   */
  simulateCapture: __DEV__,
};
