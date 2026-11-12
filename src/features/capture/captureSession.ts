import type { CaptureErrorReason } from '../inspection/types';
import { emptyIssueCounts, problemReason, type IssueCounts, type SampleIssue } from './quality';
import type { CaptureStage } from './frameFiles';

export type Candidate = { path: string; score: number };

export type CaptureOutcome =
  | { kind: 'done'; keep: string[]; discard: string[] }
  | { kind: 'problem'; reason: CaptureErrorReason; discard: string[] };

export type SessionSnapshot = {
  /** Latest frame check, or `starting` before any frame was analysed. */
  status: SampleIssue | 'starting';
  collecting: boolean;
  accepted: number;
  outcome: CaptureOutcome | null;
};

export type SessionOptions = {
  stage: CaptureStage;
  minFrames: number;
  targetFrames: number;
  timeoutMs: number;
  /** Sidewall: extra candidates gathered before keeping the best `targetFrames`. */
  extraCandidates?: number;
  /** Sidewall: once `targetFrames` are in, wait this long for sharper ones. */
  settleMs?: number;
};

/**
 * Decides when a capture stage is done, which frames to keep, and when to give
 * up with a reason. No camera or file access: the hook feeds it frame checks,
 * saved candidates and elapsed active time.
 *
 * - Sidewall: starts on `start()` (Capture button, or the detector once it
 *   exists). Keeps the sharpest `targetFrames`; done once it has
 *   `targetFrames + extraCandidates`, or `targetFrames` plus `settleMs`.
 * - Tread: collects from the start; every accepted frame counts. Done at
 *   `targetFrames`; `finish()` works from `minFrames`.
 * - If not done within `timeoutMs` of active time → problem with the real
 *   reason (spec §4.16). Sidewall keeps what it has if it reached `minFrames`.
 */
export class CaptureSession {
  private candidates: Candidate[] = [];
  private counts: IssueCounts = emptyIssueCounts();
  private activeMs = 0;
  private sinceTargetMs: number | null = null;
  private snapshot: SessionSnapshot;
  private listeners = new Set<(s: SessionSnapshot) => void>();
  /** Frames that finished saving after the outcome was decided; the caller deletes them. */
  readonly lateDiscards: string[] = [];

  constructor(private readonly options: SessionOptions) {
    this.snapshot = {
      status: 'starting',
      collecting: options.stage === 'tread',
      accepted: 0,
      outcome: null,
    };
  }

  get state(): SessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: SessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(patch: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(l => l(this.snapshot));
  }

  /** Sidewall: begin collecting. */
  start() {
    if (this.snapshot.outcome || this.snapshot.collecting) return;
    this.activeMs = 0;
    this.update({ collecting: true });
  }

  /** One analysed frame. Rejections only count while collecting. */
  sample(issue: SampleIssue) {
    if (this.snapshot.outcome) return;
    if (this.snapshot.collecting && issue !== 'ok') this.counts[issue] += 1;
    if (issue !== this.snapshot.status) this.update({ status: issue });
  }

  /** A frame that passed the checks was saved to `path`. */
  addCandidate(path: string, score: number) {
    if (this.snapshot.outcome || !this.snapshot.collecting) {
      this.lateDiscards.push(path);
      return;
    }
    this.candidates.push({ path, score });
    const { stage, targetFrames, extraCandidates = 0 } = this.options;
    this.update({ accepted: Math.min(this.candidates.length, targetFrames) });
    if (stage === 'tread') {
      if (this.candidates.length >= targetFrames) this.done(targetFrames);
    } else if (this.candidates.length >= targetFrames + extraCandidates) {
      this.done(targetFrames);
    } else if (this.candidates.length >= targetFrames && this.sinceTargetMs === null) {
      this.sinceTargetMs = 0;
    }
  }

  /** Active time passed (camera live, no dialog open). */
  tick(ms: number) {
    if (this.snapshot.outcome || !this.snapshot.collecting) return;
    this.activeMs += ms;
    if (this.sinceTargetMs !== null) {
      this.sinceTargetMs += ms;
      if (this.sinceTargetMs >= (this.options.settleMs ?? 0)) {
        this.done(this.options.targetFrames);
        return;
      }
    }
    if (this.activeMs >= this.options.timeoutMs) {
      if (this.options.stage === 'sidewall' && this.candidates.length >= this.options.minFrames) {
        this.done(this.options.targetFrames);
      } else {
        this.problem();
      }
    }
  }

  /** Tread `Finish sweep`. False when there aren't enough clear frames yet. */
  finish(): boolean {
    if (this.snapshot.outcome) return true;
    if (this.candidates.length < this.options.minFrames) return false;
    this.done(this.options.targetFrames);
    return true;
  }

  /** `Having trouble`: stop now and explain. */
  giveUp() {
    if (!this.snapshot.outcome) this.problem();
  }

  /** Current reason, from what was rejected most. */
  reason(): CaptureErrorReason {
    return problemReason(this.counts);
  }

  private done(limit: number) {
    // Keep the sharpest frames, in capture order.
    const best = [...this.candidates].sort((a, b) => b.score - a.score).slice(0, limit);
    const keepSet = new Set(best.map(c => c.path));
    this.update({
      collecting: false,
      outcome: {
        kind: 'done',
        keep: this.candidates.filter(c => keepSet.has(c.path)).map(c => c.path),
        discard: this.candidates.filter(c => !keepSet.has(c.path)).map(c => c.path),
      },
    });
  }

  private problem() {
    this.update({
      collecting: false,
      outcome: {
        kind: 'problem',
        reason: this.reason(),
        discard: this.candidates.map(c => c.path),
      },
    });
  }
}
