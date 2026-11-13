import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { diagnosticsConfig } from '../config/diagnostics';
import { absoluteFramePath } from '../features/capture/frameFiles';
import {
  getSidewallTextDetector,
  type SidewallTextDetectOutcome,
  type SidewallTextFrameResult,
} from '../ml/services/SidewallTextDetector';
import { colors, radius } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';

/** Whether the card is shown: staging builds only (`diagnosticsConfig.sidewallDetectorDebugCard`). */
export const sidewallDetectorCardShown = () => diagnosticsConfig.sidewallDetectorDebugCard;

const isRealFrame = (f: string) => !f.startsWith('demo://');
const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * STAGING ONLY (owner task 2026-11-13, Stage 1). Runs the YOLO11n-seg sidewall
 * text detector on one saved sidewall frame at a time and draws its boxes,
 * labels and scores over the frame, with a readout of inference time, tensor
 * shapes and raw value ranges. Diagnostics only: nothing here fills a field,
 * and the card renders nothing unless the staging flag is on.
 */
export function SidewallDetectorDebugCard({ frames }: { frames: string[] }) {
  const real = frames.filter(isRealFrame);
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<SidewallTextDetectOutcome | null>(null);
  const [run, setRun] = useState(0);
  const [width, setWidth] = useState(0);
  const frame = real[Math.min(index, Math.max(real.length - 1, 0))];
  const shown = sidewallDetectorCardShown();

  useEffect(() => {
    if (!shown || !frame) return;
    let cancelled = false;
    setOutcome(null);
    getSidewallTextDetector()
      .detectFrame(frame, index)
      .then(o => {
        if (!cancelled) setOutcome(o);
      })
      .catch(e => {
        if (!cancelled) setOutcome({ status: 'failed', error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [shown, frame, index, run]);

  if (!shown) return null;

  const result = outcome?.status === 'done' ? outcome.result : null;
  const aspect = result ? result.source.height / result.source.width : 1;
  const height = width > 0 ? Math.round(width * aspect) : 0;
  const scale = result && width > 0 ? width / result.source.width : 0;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View style={styles.card} testID="sidewall-detector-card">
      <AppText variant="badge" color="textSecondary">
        STAGING · Sidewall text detector
      </AppText>
      <AppText variant="caption" color="textSecondary" style={styles.note}>
        Diagnostics only. Boxes are the detector's output; nothing here fills a field.
      </AppText>
      {real.length === 0 ? (
        <AppText variant="caption" color="textSecondary">
          No saved sidewall frames to run on.
        </AppText>
      ) : (
        <>
          <View style={styles.stepper}>
            <Button
              label="Previous"
              variant="text"
              height={36}
              disabled={index <= 0}
              onPress={() => setIndex(i => Math.max(0, i - 1))}
            />
            <AppText variant="caption" color="textSecondary">
              {`Frame ${index + 1} of ${real.length}`}
            </AppText>
            <Button
              label="Next"
              variant="text"
              height={36}
              disabled={index >= real.length - 1}
              onPress={() => setIndex(i => Math.min(real.length - 1, i + 1))}
            />
          </View>
          <View style={[styles.imageBox, { height: height || 200 }]} onLayout={onLayout}>
            {frame && width > 0 ? (
              <Image
                source={{ uri: fileUri(absoluteFramePath(frame)) }}
                style={{ width, height: height || 200 }}
                resizeMode="contain"
                accessibilityLabel={`Sidewall frame ${index + 1}`}
              />
            ) : null}
            {result?.detections.map((d, i) =>
              d.frameRect ? (
                <View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.box,
                    {
                      left: d.frameRect.x * scale,
                      top: d.frameRect.y * scale,
                      width: Math.max(2, d.frameRect.width * scale),
                      height: Math.max(2, d.frameRect.height * scale),
                    },
                  ]}
                >
                  <View style={styles.tag}>
                    <AppText variant="badge" color="white">
                      {`${d.label} ${d.score.toFixed(2)}`}
                    </AppText>
                  </View>
                </View>
              ) : null,
            )}
          </View>
          <AppText variant="caption" color="black" style={[styles.readout, { fontFamily: mono }]}>
            {readoutText(outcome)}
          </AppText>
          <Button label="Run again" variant="text" height={36} onPress={() => setRun(n => n + 1)} />
        </>
      )}
    </View>
  );
}

function fileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

const shapeText = (t: { name: string; shape: number[]; dataType: string }) => `[${t.shape.join(',')}] ${t.dataType}`;
const rangeText = (r: { min: number; max: number } | null) => (r ? `${r.min} … ${r.max}` : 'n/a');

/** The readout under the frame: one fact per line, so it can be read off a phone screenshot. */
export function readoutText(outcome: SidewallTextDetectOutcome | null): string {
  if (!outcome) return 'Running…';
  if (outcome.status === 'unavailable') {
    return outcome.reason === 'model_missing'
      ? `Model not loaded\n${outcome.detail}`
      : `Frame is not a saved file\n${outcome.detail}`;
  }
  if (outcome.status === 'failed') return `Failed\n${outcome.error}`;
  const r: SidewallTextFrameResult = outcome.result;
  const lb = r.letterbox;
  const lines = [
    `model ${r.modelVersion}`,
    `delegate ${r.delegate}${r.loadMs !== null ? `, load ${r.loadMs} ms` : ''}`,
    `frame ${r.source.width}×${r.source.height}`,
    lb ? `letterbox scale ${lb.scale.toFixed(4)} pad ${lb.padX},${lb.padY}` : 'letterbox n/a',
    `decode ${r.timings.decodeMs} ms · infer ${r.timings.inferenceMs} ms · post ${r.timings.postMs} ms`,
    `in  ${r.tensors.inputs.map(shapeText).join(' ')}`,
    `out ${r.tensors.outputs.map(shapeText).join(' | ')}`,
    `boxes raw ${rangeText(r.stats.boxes)} → ${r.boxFormat.used}${r.boxFormat.overridden ? ` (manifest says ${r.boxFormat.manifest}!)` : ''}`,
    `class max ${Object.entries(r.stats.classMax)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    `mask coef ${rangeText(r.stats.maskCoefficients)} · protos ${rangeText(r.stats.prototypes)}`,
    `conf ≥ ${r.thresholds.confidence}: ${r.stats.anchorsAboveThreshold} of ${r.stats.anchors} anchors · IoU ${r.thresholds.iou}`,
    `${r.detections.length} detections after NMS`,
    ...r.detections.map(
      d =>
        `  ${d.label} ${d.score.toFixed(3)} ${
          d.frameRect
            ? `@ ${Math.round(d.frameRect.x)},${Math.round(d.frameRect.y)} ${Math.round(d.frameRect.width)}×${Math.round(d.frameRect.height)}`
            : '(in padding)'
        }`,
    ),
  ];
  return lines.join('\n');
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceMuted,
  },
  note: { marginTop: -4 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  imageBox: { width: '100%', backgroundColor: colors.black, overflow: 'hidden' },
  box: { position: 'absolute', borderWidth: 2, borderColor: colors.cameraBlue },
  tag: { position: 'absolute', left: -2, top: -2, backgroundColor: colors.navy, paddingHorizontal: 4, paddingVertical: 1 },
  readout: { lineHeight: 17 },
});
