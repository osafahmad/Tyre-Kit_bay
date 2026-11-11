import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { CommonResolutions, useFrameOutput, type Frame } from 'react-native-vision-camera';
import type { Image } from 'react-native-nitro-image';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { captureConfig } from '../../config/capture';
import { inspectionConfig } from '../../config/inspection';
import { CaptureSession, type SessionSnapshot } from './captureSession';
import { classifyFrame, measureLuma, thumbDifference, type FrameIssue } from './quality';
import type { Rect, Size } from './guideGeometry';
import { cropFrameToGuide } from './frameCrop';
import { deleteQuietly, isNoSpace, newTempFramePath, type CaptureStage } from './frameFiles';
import { frameDropHandler } from './frameDrops';

const onTyreFrameDropped = frameDropHandler('tyre-capture');

type Geometry = { guide: Rect; view: Size } | null;

const PLATFORM = Platform.OS;

const TICK_MS = 250;

const THRESHOLDS = {
  minBrightness: captureConfig.minBrightness,
  maxBrightness: captureConfig.maxBrightness,
  minSharpness: captureConfig.minSharpness,
  maxSteadyMotion: captureConfig.maxSteadyMotion,
};

/**
 * Tyre capture for one stage (sidewall or tread), using a VisionCamera v5
 * frame output.
 *
 * Camera thread (worklet), about `analysisFps` times a second:
 *   luminance plane → brightness, sharpness (Laplacian variance), motion →
 *   if the frame passes and the stage is collecting, convert → upright → crop
 *   to the guide → hand the image to JS. The frame, its planes and every
 *   intermediate image are disposed on every path.
 * JS thread: writes the crop to a temporary JPEG and gives it to the
 *   `CaptureSession`, which decides when the stage is done or failed.
 *
 * `active` must be false while the camera isn't live or a dialog is open:
 * no frames are taken and the timeout doesn't run.
 */
export function useTyreCapture({ stage, active }: { stage: CaptureStage; active: boolean }) {
  const c = inspectionConfig.capture;
  const session = useMemo(
    () =>
      new CaptureSession(
        stage === 'sidewall'
          ? {
              stage,
              minFrames: c.sidewallMinFrames,
              targetFrames: c.sidewallTargetFrames,
              timeoutMs: c.timeoutSeconds * 1000,
              extraCandidates: captureConfig.sidewallExtraCandidates,
              settleMs: captureConfig.sidewallSettleMs,
            }
          : {
              stage,
              minFrames: c.treadMinFrames,
              targetFrames: c.treadTargetFrames,
              timeoutMs: c.timeoutSeconds * 1000,
            },
      ),
    // A new session per mount; the screen remounts for a retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage],
  );
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(session.state);
  const [lowStorage, setLowStorage] = useState(false);
  useEffect(() => session.subscribe(setSnapshot), [session]);

  // Shared with the camera thread.
  const sync = useMemo(
    () => ({
      active: createSynchronizable(false),
      collecting: createSynchronizable(false),
      busy: createSynchronizable(false),
      lastAnalysis: createSynchronizable(0),
      lastAccept: createSynchronizable(0),
      prevThumb: createSynchronizable<number[] | null>(null),
      /** Last result sent to JS, so a run of passing frames doesn't call JS 10 times a second. */
      lastSentIssue: createSynchronizable<FrameIssue | 'repeat' | null>(null),
      lastAcceptedThumb: createSynchronizable<number[] | null>(null),
      geometry: createSynchronizable<Geometry>(null),
    }),
    [],
  );

  const running = active && !lowStorage && snapshot.outcome === null;
  useEffect(() => {
    sync.active.setBlocking(running);
    sync.collecting.setBlocking(running && snapshot.collecting);
  }, [sync, running, snapshot.collecting]);

  // Timeout only counts active time.
  useEffect(() => {
    if (!running || !snapshot.collecting) return;
    const timer = setInterval(() => session.tick(TICK_MS), TICK_MS);
    return () => clearInterval(timer);
  }, [session, running, snapshot.collecting]);

  // Delete frames that finished saving after the outcome.
  const unmounted = useRef(false);
  useEffect(
    () => () => {
      unmounted.current = true;
    },
    [],
  );

  const onSample = useCallback((issue: FrameIssue | 'repeat') => session.sample(issue), [session]);

  const onFrameImage = useCallback(
    async (image: Image, score: number) => {
      let path: string | null = null;
      try {
        path = await newTempFramePath();
        await image.saveToFileAsync(path, 'jpg', captureConfig.jpegQualityPercent);
        if (unmounted.current) {
          await deleteQuietly([path]);
        } else {
          session.addCandidate(path, score);
          if (session.lateDiscards.length) await deleteQuietly(session.lateDiscards.splice(0));
        }
      } catch (e) {
        if (path) await deleteQuietly([path]);
        if (isNoSpace(e)) setLowStorage(true);
      } finally {
        image.dispose();
        sync.busy.setBlocking(false);
      }
    },
    [session, sync],
  );

  const requireSteady = stage === 'sidewall';
  const acceptIntervalMs =
    stage === 'sidewall' ? captureConfig.sidewallAcceptIntervalMs : captureConfig.treadAcceptIntervalMs;
  const minNovelty = captureConfig.minTreadNovelty;
  const region = captureConfig.analysisRegion;
  const step = captureConfig.sampleStep;
  const guideMargin = captureConfig.guideMargin;
  const analysisIntervalMs = 1000 / captureConfig.analysisFps;

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      // Planes are released as soon as they've been read, and again in `finally`
      // if reading threw. The frame itself is always disposed in `finally`.
      let planes: ReturnType<Frame['getPlanes']> | null = null;
      try {
        if (!sync.active.getBlocking()) return;
        const now = Date.now();
        if (now - sync.lastAnalysis.getBlocking() < analysisIntervalMs) return;
        sync.lastAnalysis.setBlocking(now);

        // Luminance (Y) is plane 0 of the YUV frame.
        planes = frame.getPlanes();
        if (planes.length === 0) return;
        const y = planes[0];
        const metrics = measureLuma(
          new Uint8Array(y.getPixelBuffer()),
          y.width,
          y.height,
          y.bytesPerRow,
          region,
          step,
        );
        for (const p of planes) p.dispose();
        planes = null;

        const motion = thumbDifference(sync.prevThumb.getBlocking(), metrics.thumb);
        sync.prevThumb.setBlocking(metrics.thumb);
        let issue: FrameIssue | 'repeat' = classifyFrame(metrics, motion, THRESHOLDS, requireSteady);

        if (
          issue === 'ok' &&
          sync.collecting.getBlocking() &&
          !sync.busy.getBlocking() &&
          now - sync.lastAccept.getBlocking() >= acceptIntervalMs
        ) {
          // Tread: only count a frame once the sweep has moved on.
          if (
            !requireSteady &&
            thumbDifference(sync.lastAcceptedThumb.getBlocking(), metrics.thumb) < minNovelty
          ) {
            issue = 'repeat';
          } else {
            sync.busy.setBlocking(true);
            sync.lastAccept.setBlocking(now);
            sync.lastAcceptedThumb.setBlocking(metrics.thumb);
            // Upright once, crop to the guide; intermediates are disposed inside.
            // Before the guide is laid out the whole upright frame is kept.
            const g = sync.geometry.getBlocking();
            const result = cropFrameToGuide(
              frame,
              g ? { guide: g.guide, view: g.view, margin: guideMargin } : null,
              PLATFORM,
              false,
            );
            if (result.ok) {
              try {
                scheduleOnRN(onFrameImage, result.image, metrics.sharpness);
              } catch {
                // Not handed over: dispose it here and free the pipeline.
                result.image.dispose();
                sync.busy.setBlocking(false);
              }
            } else {
              sync.busy.setBlocking(false);
            }
          }
        }
        // `ok` frames aren't counted, so only a change to `ok` is sent. Rejections
        // are always sent: the session counts them while collecting.
        if (issue !== 'ok' || sync.lastSentIssue.getBlocking() !== 'ok') {
          sync.lastSentIssue.setBlocking(issue);
          scheduleOnRN(onSample, issue);
        }
      } catch {
        // A bad frame is skipped; the next one is analysed.
      } finally {
        if (planes) {
          for (const p of planes) {
            try {
              p.dispose();
            } catch {
              // Already released with the frame.
            }
          }
        }
        frame.dispose();
      }
    },
    [
      sync,
      onFrameImage,
      onSample,
      requireSteady,
      acceptIntervalMs,
      minNovelty,
      region,
      step,
      guideMargin,
      analysisIntervalMs,
    ],
  );

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.HD_16_9,
    pixelFormat: 'yuv',
    dropFramesWhileBusy: true,
    onFrame,
    onFrameDropped: onTyreFrameDropped,
  });

  const setGuide = useCallback(
    (guide: Rect, view: Size) => sync.geometry.setBlocking({ guide, view }),
    [sync],
  );

  return {
    frameOutput,
    setGuide,
    snapshot,
    lowStorage,
    session,
    /** Sidewall Capture button. */
    start: () => session.start(),
    /** Tread `Finish sweep`; false when more frames are needed. */
    finish: () => session.finish(),
    /** `Having trouble`. */
    giveUp: () => session.giveUp(),
  };
}
