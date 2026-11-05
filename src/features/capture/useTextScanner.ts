import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { CommonResolutions, useFrameOutput, type Frame } from 'react-native-vision-camera';
import type { Image } from 'react-native-nitro-image';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { unlink } from '@dr.pogodin/react-native-fs';
import { ocrConfig } from '../../config/capture';
import { isOcrAvailable, recognizeLines } from '../../ml/ocr/ocr';
import type { OcrLineLike } from '../../ml/ocr/textCandidates';
import type { Rect, Size } from './guideGeometry';
import { cropFrameToGuide, type GuideGeometry } from './frameCrop';

/**
 * Why a pass produced no lines, kept apart from "no text found":
 * - `ocr`: ML Kit (native) failed or rejected the image.
 * - `capture`: no usable camera image — conversion/crop error, the guide not
 *   laid out yet, saving the crop failed, or no frame answered a Capture press in time.
 */
export type ScanFailure = 'ocr' | 'capture';

export type ScanResult = {
  lines: OcrLineLike[];
  /** Size of the cropped guide image the lines were read from. */
  crop: Size;
  /** True when this pass was triggered by the Capture button. */
  manual: boolean;
  /** Set when the pass failed; `lines` is then empty. Only sent for Capture presses. */
  failure?: ScanFailure;
};

export type ScannerState = 'idle' | 'scanning' | 'unavailable' | 'error';

const PLATFORM = Platform.OS;
const EMPTY = { width: 0, height: 0 };

/**
 * Live OCR inside the guide box, using a VisionCamera v5 frame output.
 *
 * On the camera thread, at most one frame at a time is converted, made upright
 * once and cropped to the guide (`cropFrameToGuide`); the frame and every
 * intermediate image are disposed on every path. The crop goes to the JS
 * thread, is written to a temporary JPEG for ML Kit, then the file and image
 * are deleted.
 *
 * A Capture press always ends in `onResult({ manual: true, ... })`: with lines,
 * with no lines (nothing read), or with a `failure`.
 */
export function useTextScanner({
  enabled,
  onResult,
}: {
  enabled: boolean;
  onResult: (result: ScanResult) => void;
}) {
  const available = useMemo(isOcrAvailable, []);
  const [state, setState] = useState<ScannerState>(available ? 'idle' : 'unavailable');

  // Shared with the camera thread.
  const busy = useMemo(() => createSynchronizable(false), []);
  const active = useMemo(() => createSynchronizable(false), []);
  const geometry = useMemo(() => createSynchronizable<GuideGeometry | null>(null), []);
  /** A Capture press is waiting for an answer. The camera thread reads it to report failures. */
  const manualPending = useMemo(() => createSynchronizable(false), []);

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const errors = useRef(0);
  const manualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    active.setBlocking(enabled && available);
    setState(available ? (enabled ? 'scanning' : 'idle') : 'unavailable');
  }, [active, available, enabled]);

  useEffect(
    () => () => {
      if (manualTimer.current) clearTimeout(manualTimer.current);
    },
    [],
  );

  /** Takes the pending Capture press, if any. Returns whether this pass answers it. */
  const takeManual = useCallback(() => {
    const manual = manualPending.getBlocking();
    if (manual) {
      manualPending.setBlocking(false);
      if (manualTimer.current) clearTimeout(manualTimer.current);
      manualTimer.current = null;
    }
    return manual;
  }, [manualPending]);

  /** Called with the guide box and the preview size, both in view points. */
  const setGuide = useCallback(
    (guide: Rect, view: Size) => geometry.setBlocking({ guide, view, margin: ocrConfig.guideMargin }),
    [geometry],
  );

  const handleCrop = useCallback(
    async (image: Image) => {
      let path: string | null = null;
      const manual = takeManual();
      let stage: 'save' | 'ocr' = 'save';
      try {
        const crop = { width: image.width, height: image.height };
        path = await image.saveToTemporaryFileAsync('jpg', ocrConfig.jpegQualityPercent);
        stage = 'ocr';
        const lines = await recognizeLines(path);
        errors.current = 0;
        onResultRef.current({ lines, crop, manual });
      } catch {
        errors.current += 1;
        if (errors.current >= 3) setState('error');
        const failure: ScanFailure = stage === 'ocr' ? 'ocr' : 'capture';
        if (manual) onResultRef.current({ lines: [], crop: EMPTY, manual, failure });
      } finally {
        image.dispose();
        if (path) unlink(path).catch(() => {});
        setTimeout(() => busy.setBlocking(false), ocrConfig.scanIntervalMs);
      }
    },
    [busy, takeManual],
  );

  /** A frame gave no crop (camera-thread error, or no usable guide rect). */
  const handleNoCrop = useCallback(
    () => {
      if (takeManual()) onResultRef.current({ lines: [], crop: EMPTY, manual: true, failure: 'capture' });
    },
    [takeManual],
  );

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (!active.getBlocking() || busy.getBlocking()) return;
        const g = geometry.getBlocking();
        if (g === null) {
          // Guide not laid out yet. Only bother JS when a Capture press is waiting.
          if (manualPending.getBlocking()) scheduleOnRN(handleNoCrop);
          return;
        }
        busy.setBlocking(true);
        const result = cropFrameToGuide(frame, g, PLATFORM, true);
        if (result.ok) {
          scheduleOnRN(handleCrop, result.image);
        } else {
          busy.setBlocking(false);
          if (manualPending.getBlocking()) scheduleOnRN(handleNoCrop);
        }
      } catch {
        busy.setBlocking(false);
        if (manualPending.getBlocking()) scheduleOnRN(handleNoCrop);
      } finally {
        // Every frame is released, whether or not it was used.
        frame.dispose();
      }
    },
    [active, busy, geometry, manualPending, handleCrop, handleNoCrop],
  );

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.HD_16_9,
    dropFramesWhileBusy: true,
    onFrame,
  });

  /** Capture button: use the next OCR pass as a one-off read. Always answered. */
  const captureOnce = useCallback(() => {
    manualPending.setBlocking(true);
    if (manualTimer.current) clearTimeout(manualTimer.current);
    manualTimer.current = setTimeout(() => {
      manualTimer.current = null;
      // No frame answered (camera paused, not live, or stalled).
      if (manualPending.getBlocking()) {
        manualPending.setBlocking(false);
        onResultRef.current({ lines: [], crop: EMPTY, manual: true, failure: 'capture' });
      }
    }, ocrConfig.manualCaptureTimeoutMs);
  }, [manualPending]);

  return { frameOutput, state, available, setGuide, captureOnce };
}
