import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CommonResolutions,
  HybridFrameConverter,
  useFrameOutput,
  type Frame,
} from 'react-native-vision-camera';
import type { Image } from 'react-native-nitro-image';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';
import { unlink } from '@dr.pogodin/react-native-fs';
import { ocrConfig } from '../../config/ocr';
import { isOcrAvailable, recognizeLines } from '../../ml/ocr/ocr';
import type { OcrLineLike } from '../../ml/ocr/textCandidates';
import { guideToImageRect, uprightRotation, type Rect, type Size } from './guideGeometry';

export type ScanResult = {
  lines: OcrLineLike[];
  /** Size of the cropped guide image the lines were read from. */
  crop: Size;
  /** True when this pass was triggered by the Capture button. */
  manual: boolean;
};

export type ScannerState = 'idle' | 'scanning' | 'unavailable' | 'error';

type Geometry = { guide: Rect; view: Size; margin: number } | null;

/**
 * Live OCR inside the guide box, using a VisionCamera v5 frame output.
 *
 * On the camera thread, at most one frame at a time is converted, turned
 * upright and cropped to the guide; the frame and every intermediate image are
 * disposed straight away. The crop goes to the JS thread, is written to a
 * temporary file for ML Kit, then the file and image are deleted.
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
  const geometry = useMemo(() => createSynchronizable<Geometry>(null), []);

  const manualRequested = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const errors = useRef(0);

  useEffect(() => {
    active.setBlocking(enabled && available);
    setState(available ? (enabled ? 'scanning' : 'idle') : 'unavailable');
  }, [active, available, enabled]);

  /** Called with the guide box and the preview size, both in view points. */
  const setGuide = useCallback(
    (guide: Rect, view: Size) => geometry.setBlocking({ guide, view, margin: ocrConfig.guideMargin }),
    [geometry],
  );

  const handleCrop = useCallback(
    async (image: Image) => {
      let path: string | null = null;
      const manual = manualRequested.current;
      manualRequested.current = false;
      try {
        const crop = { width: image.width, height: image.height };
        path = await image.saveToTemporaryFileAsync('jpg', 0.9);
        const lines = await recognizeLines(path);
        errors.current = 0;
        onResultRef.current({ lines, crop, manual });
      } catch {
        errors.current += 1;
        if (errors.current >= 3) setState('error');
        if (manual) onResultRef.current({ lines: [], crop: { width: 0, height: 0 }, manual });
      } finally {
        image.dispose();
        if (path) unlink(path).catch(() => {});
        setTimeout(() => busy.setBlocking(false), ocrConfig.scanIntervalMs);
      }
    },
    [busy],
  );

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (!active.getBlocking() || busy.getBlocking()) return;
        const g = geometry.getBlocking();
        if (g === null) return;
        busy.setBlocking(true);

        const converted = HybridFrameConverter.convertFrameToImage(frame);
        const degrees = uprightRotation(frame.orientation);
        const upright = degrees === 0 ? converted : converted.rotate(degrees);
        if (upright !== converted) converted.dispose();

        const rect = guideToImageRect(
          g.guide,
          g.view,
          { width: upright.width, height: upright.height },
          g.margin,
        );
        if (rect === null) {
          upright.dispose();
          busy.setBlocking(false);
          return;
        }
        const cropped = upright.crop(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
        upright.dispose();
        scheduleOnRN(handleCrop, cropped);
      } catch {
        busy.setBlocking(false);
      } finally {
        // Every frame is released, whether or not it was used.
        frame.dispose();
      }
    },
    [active, busy, geometry, handleCrop],
  );

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.HD_16_9,
    dropFramesWhileBusy: true,
    onFrame,
  });

  /** Capture button: use the next OCR pass as a one-off read. */
  const captureOnce = useCallback(() => {
    manualRequested.current = true;
  }, []);

  return { frameOutput, state, available, setGuide, captureOnce };
}
