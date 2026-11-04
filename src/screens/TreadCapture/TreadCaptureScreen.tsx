import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AppText,
  Button,
  CameraStatusPill,
  CameraTitle,
  DarkTopBar,
  DemoDataLabel,
  TreadArrowsArt,
  TreadPatternArt,
  Viewfinder,
} from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { useInspectionStore, useTyre } from '../../features/inspection/store';
import { tyreName } from '../../features/inspection/positions';
import type { CaptureErrorReason } from '../../features/inspection/types';
import { inspectionConfig } from '../../config/inspection';
import { canSimulateCapture, simulatedFrames } from '../../features/capture/simulatedCapture';
import { feedback } from '../../features/feedback/feedback';
import { colors, radius } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TreadCapture'>;

const KEEP_GOING = 'Keep going. A few more clear frames are needed.';

/**
 * 15 Tread capture (Tread.dc.html). Progress = accepted frames / target.
 * Finishes at the target, opens Capture problem after the timeout. Real frame
 * acceptance arrives in M5; until then development builds simulate frames.
 */
export function TreadCaptureScreen({ navigation, route }: Props) {
  const { tyreId } = route.params;
  const insets = useSafeAreaInsets();
  const found = useTyre(tyreId);
  const setTreadCaptured = useInspectionStore(s => s.setTreadCaptured);
  const setCaptureProblem = useInspectionStore(s => s.setCaptureProblem);
  const { treadMinFrames, treadTargetFrames, timeoutSeconds } = inspectionConfig.capture;

  const [accepted, setAccepted] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The most recent quality problem, so Capture problem shows the real reason.
  const lastIssue = useRef<CaptureErrorReason>('not_found');
  const done = useRef(false);

  const finish = useCallback(
    (count: number) => {
      if (done.current) return;
      done.current = true;
      setTreadCaptured(tyreId, simulatedFrames('tread', count));
      navigation.replace('FramesCaptured', { tyreId });
    },
    [navigation, setTreadCaptured, tyreId],
  );

  // Simulated frames (development only).
  useEffect(() => {
    if (!canSimulateCapture) return;
    const timer = setInterval(() => setAccepted(n => Math.min(n + 1, treadTargetFrames)), 450);
    return () => clearInterval(timer);
  }, [treadTargetFrames]);

  useEffect(() => {
    if (accepted >= treadTargetFrames) finish(accepted);
  }, [accepted, finish, treadTargetFrames]);

  // Open Capture problem if the target isn't reached in time.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (done.current) return;
      done.current = true;
      setCaptureProblem(tyreId, lastIssue.current);
      feedback.warning();
      navigation.replace('CaptureProblem', { tyreId, stage: 'tread', reason: lastIssue.current });
    }, timeoutSeconds * 1000);
    return () => clearTimeout(timer);
  }, [navigation, setCaptureProblem, timeoutSeconds, tyreId]);

  if (!found) return null;
  const { inspection, tyre, index } = found;
  const percent = Math.round((accepted / treadTargetFrames) * 100);
  const canFinish = accepted >= treadMinFrames;

  const onFinish = () => {
    if (canFinish) {
      finish(accepted);
    } else {
      setMessage(KEEP_GOING);
      feedback.announce(KEEP_GOING);
    }
  };

  const onTrouble = () => {
    done.current = true;
    setCaptureProblem(tyreId, lastIssue.current);
    navigation.replace('CaptureProblem', { tyreId, stage: 'tread', reason: lastIssue.current });
  };

  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  return (
    <View style={styles.root}>
      <DarkTopBar
        onBack={() => navigation.goBack()}
        centreLabel={`Tyre ${index + 1} of ${inspection.tyres.length}`}
      />
      <CameraTitle title={tyreName(tyre.position)} subtitle="Step 2 of 2: tread" />
      <Viewfinder>
        <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
          {size.width > 0 ? <TreadPatternArt width={size.width} height={size.height} /> : null}
        </View>
        <CameraStatusPill label="Distance OK" showCheck style={styles.pill} />
        {canSimulateCapture ? (
          <View style={styles.demo}>
            <DemoDataLabel tone="dark" />
          </View>
        ) : null}
        <View style={styles.guide} accessibilityLabel="Tread guide. Move from edge to edge.">
          <TreadArrowsArt width={Math.min(240, Math.max(0, size.width - 80))} />
        </View>
        <AppText variant="rowLabel" color="white" align="center" style={styles.hint}>
          Move slowly across the tread, from edge to edge
        </AppText>
      </Viewfinder>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <View style={styles.progressRow}>
          <AppText variant="caption" color="white">
            Capturing frames
          </AppText>
          <AppText variant="caption" weight="semibold" color="white">
            {`${percent}%`}
          </AppText>
        </View>
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Capture progress"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
        {message ? (
          <AppText variant="caption" color="textOnDark" style={styles.message} accessibilityLiveRegion="polite">
            {message}
          </AppText>
        ) : null}
        <View style={styles.buttons}>
          <Button
            label="Having trouble"
            variant="secondary"
            tone="dark"
            height={52}
            onPress={onTrouble}
            style={styles.button}
          />
          <Button
            label="Finish sweep"
            tone="dark"
            height={52}
            onPress={onFinish}
            accessibilityHint={canFinish ? undefined : KEEP_GOING}
            style={[styles.button, !canFinish && styles.notReady]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  pill: { position: 'absolute', top: 16 },
  demo: { position: 'absolute', top: 60, alignSelf: 'center' },
  guide: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 140,
    borderWidth: 3,
    borderColor: colors.cameraBlue,
    borderRadius: 14,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { position: 'absolute', left: 24, right: 24, bottom: 18 },
  bottom: { paddingTop: 18, paddingHorizontal: 24 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  track: { height: 8, backgroundColor: colors.darkLine, borderRadius: radius.badge, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.cameraBlue },
  message: { marginTop: 10 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 14 },
  button: { flex: 1, paddingHorizontal: 8 },
  notReady: { opacity: 0.6 },
});
