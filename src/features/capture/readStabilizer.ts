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

  reset() {
    this.recent = [];
    this.latest.clear();
  }
}
