import { ocrConfig } from '../../config/capture';

/**
 * Accepts an OCR value once the same value has been read `stableReads` times
 * within the last `readWindow` reads. Values are compared by a key (for plates:
 * ignoring spaces and hyphens) and the most recent spelling is returned.
 */
export class ReadStabilizer {
  private recent: (string | null)[] = [];
  private latest = new Map<string, string>();

  constructor(
    private readonly keyOf: (value: string) => string = v => v,
    private readonly stableReads = ocrConfig.stableReads,
    private readonly window = ocrConfig.readWindow,
  ) {}

  /** Add one read (null when nothing usable was read). Returns the stable value, if any. */
  push(value: string | null): string | null {
    const key = value === null ? null : this.keyOf(value);
    if (key !== null && value !== null) this.latest.set(key, value);
    this.recent.push(key);
    if (this.recent.length > this.window) this.recent.shift();
    if (key === null) return null;
    const count = this.recent.filter(k => k === key).length;
    return count >= this.stableReads ? (this.latest.get(key) ?? null) : null;
  }

  /**
   * How close the most-read value in the window is to being accepted, 0 to 1.
   * Display only (the scan progress ring); it can fall as reads leave the window.
   */
  progress(): number {
    const counts = new Map<string, number>();
    let best = 0;
    for (const key of this.recent) {
      if (key === null) continue;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      if (n > best) best = n;
    }
    return Math.min(1, best / this.stableReads);
  }

  reset() {
    this.recent = [];
    this.latest.clear();
  }
}
