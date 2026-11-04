import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useCameraDevice } from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AppText,
  Button,
  CameraStatusPill,
  CameraTitle,
  DarkTopBar,
  DemoDataLabel,
  FlashToggle,
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
import { CaptureCamera, type CameraIssue } from '../../features/capture/CaptureCamera';
import { useTyreCapture } from '../../features/capture/useTyreCapture';
import { useGuideLayout } from '../../features/capture/useGuideLayout';
import { useStageOutcome } from '../../features/capture/useStageOutcome';
import { useStorageCheck } from '../../features/capture/useStorageCheck';
import { useCaptureBlock } from '../../features/capture/captureBlock';
import { captureStatusText } from '../../features/capture/statusText';
import { SaveProblemOverlay } from '../../features/capture/CaptureOverlays';
import { feedback } from '../../features/feedback/feedback';
import { colors, radius } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TreadCapture'>;

export const KEEP_GOING = 'Keep going. A few more clear frames are needed.';
export const TREAD_HINT = 'Move slowly across the tread, from edge to edge';

/**
 * 15 Tread capture (Tread.dc.html). Progress = accepted frames / target.
 * Finishes at the target; `Finish sweep` works from the minimum; Capture
 * problem opens with the real reason if the target isn't reached in time.
 * No tread or damage model runs here: they run after capture (spec §4.15).
 */
export function TreadCaptureScreen(props: Props) {
  const device = useCameraDevice('back');
  const found = useTyre(props.route.params.tyreId);
  if (!found) return null;
  return canSimulateCapture && !device ? <SimulatedTread {...props} /> : <LiveTread {...props} />;
}

type ChromeProps = Props & {
  percent: number;
  message: string | null;
  onTrouble: () => void;
  onFinish: () => void;
  canFinish: boolean;
  flash?: React.ReactNode;
  children: React.ReactNode;
};

function Chrome({
  navigation,
  route,
  percent,
  message,
  onTrouble,
  onFinish,
  canFinish,
  flash,
  children,
}: ChromeProps) {
  const insets = useSafeAreaInsets();
  const found = useTyre(route.params.tyreId)!;
  return (
    <View style={styles.root}>
      <DarkTopBar
        onBack={() => navigation.goBack()}
        centreLabel={`Tyre ${found.index + 1} of ${found.inspection.tyres.length}`}
      />
      <CameraTitle title={tyreName(found.tyre.position)} subtitle="Step 2 of 2: tread" />
      <Viewfinder>{children}</Viewfinder>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <View style={styles.progressRow}>
          <AppText variant="caption" color="white">
            Capturing frames
          </AppText>
          <View style={styles.progressRight}>
            {flash}
            <AppText variant="caption" weight="semibold" color="white">
              {`${percent}%`}
            </AppText>
          </View>
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

function GuideBox({
  onLayout,
  width,
  live,
}: {
  onLayout?: (e: LayoutChangeEvent) => void;
  width: number;
  live: boolean;
}) {
  return (
    <View
      style={[styles.guide, live ? styles.guideLive : styles.guideStatic]}
      onLayout={onLayout}
      accessible
      accessibilityLabel="Tread guide. Move from edge to edge."
    >
      <TreadArrowsArt width={Math.min(240, Math.max(0, width - 80))} />
    </View>
  );
}

function LiveTread(props: Props) {
  const { navigation, route } = props;
  const { tyreId } = route.params;
  const found = useTyre(tyreId)!;
  const [flashOn, setFlashOn] = useState(false);
  const [live, setLive] = useState(false);
  const [issue, setIssue] = useState<CameraIssue>(null);
  const [saveError, setSaveError] = useState<'storage' | 'other' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const blocked = useCaptureBlock(s => s.blocked);
  const focused = useIsFocused();
  const storage = useStorageCheck();
  const device = useCameraDevice('back');

  const capture = useTyreCapture({
    stage: 'tread',
    active: live && focused && !blocked && storage.enough && saveError === null,
  });
  const layout = useGuideLayout(capture.setGuide);

  useStageOutcome({
    outcome: capture.snapshot.outcome,
    inspectionId: found.inspection.id,
    tyreId,
    stage: 'tread',
    onSaved: useCallback(() => navigation.replace('FramesCaptured', { tyreId }), [navigation, tyreId]),
    onProblem: useCallback(
      (reason: CaptureErrorReason) =>
        navigation.replace('CaptureProblem', { tyreId, stage: 'tread', reason }),
      [navigation, tyreId],
    ),
    onSaveError: setSaveError,
  });

  const { treadMinFrames, treadTargetFrames } = inspectionConfig.capture;
  const accepted = capture.snapshot.accepted;
  const percent = Math.round((accepted / treadTargetFrames) * 100);
  const status = captureStatusText('tread', capture.snapshot);
  const problem = saveError ?? (storage.enough ? null : 'storage');

  return (
    <Chrome
      {...props}
      percent={percent}
      message={message}
      canFinish={accepted >= treadMinFrames}
      onFinish={() => {
        if (!capture.finish()) {
          setMessage(KEEP_GOING);
          feedback.announce(KEEP_GOING);
        }
      }}
      onTrouble={capture.giveUp}
      flash={
        <FlashToggle
          on={flashOn}
          onToggle={() => setFlashOn(v => !v)}
          available={issue === null && !!device?.hasTorch}
        />
      }
    >
      <CaptureCamera
        frameOutput={capture.frameOutput}
        torchOn={flashOn}
        onLayout={e => {
          setWidth(e.nativeEvent.layout.width);
          layout.onViewLayout(e);
        }}
        onLiveChange={setLive}
        onIssueChange={setIssue}
      >
        <CameraStatusPill label={status.label} showCheck={status.ok} style={styles.pill} />
        <GuideBox onLayout={layout.onGuideLayout} width={width} live />
        <AppText variant="rowLabel" color="white" align="center" style={styles.hint}>
          {TREAD_HINT}
        </AppText>
      </CaptureCamera>
      {problem ? (
        <SaveProblemOverlay
          kind={problem}
          onRetry={async () => {
            if (saveError) navigation.replace('TreadCapture', { tyreId });
            else await storage.recheck();
          }}
        />
      ) : null}
    </Chrome>
  );
}

/** Development only: no camera, fake frames, labelled Demo data. */
function SimulatedTread(props: Props) {
  const { navigation, route } = props;
  const { tyreId } = route.params;
  const setTreadCaptured = useInspectionStore(s => s.setTreadCaptured);
  const setCaptureProblem = useInspectionStore(s => s.setCaptureProblem);
  const { treadMinFrames, treadTargetFrames, timeoutSeconds } = inspectionConfig.capture;
  const [accepted, setAccepted] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
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

  useEffect(() => {
    const timer = setInterval(() => setAccepted(n => Math.min(n + 1, treadTargetFrames)), 450);
    return () => clearInterval(timer);
  }, [treadTargetFrames]);

  useEffect(() => {
    if (accepted >= treadTargetFrames) finish(accepted);
  }, [accepted, finish, treadTargetFrames]);

  const trouble = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setCaptureProblem(tyreId, 'too_few_frames');
    navigation.replace('CaptureProblem', { tyreId, stage: 'tread', reason: 'too_few_frames' });
  }, [navigation, setCaptureProblem, tyreId]);

  useEffect(() => {
    const timer = setTimeout(trouble, timeoutSeconds * 1000);
    return () => clearTimeout(timer);
  }, [trouble, timeoutSeconds]);

  return (
    <Chrome
      {...props}
      percent={Math.round((accepted / treadTargetFrames) * 100)}
      message={message}
      canFinish={accepted >= treadMinFrames}
      onFinish={() => {
        if (accepted >= treadMinFrames) finish(accepted);
        else {
          setMessage(KEEP_GOING);
          feedback.announce(KEEP_GOING);
        }
      }}
      onTrouble={trouble}
    >
      <View style={StyleSheet.absoluteFill} onLayout={e => setSize(e.nativeEvent.layout)}>
        {size.width > 0 ? <TreadPatternArt width={size.width} height={size.height} /> : null}
      </View>
      <CameraStatusPill label="Distance OK" showCheck style={styles.pill} />
      <View style={styles.demo}>
        <DemoDataLabel tone="dark" />
      </View>
      <GuideBox width={size.width} live={false} />
      <AppText variant="rowLabel" color="white" align="center" style={styles.hint}>
        {TREAD_HINT}
      </AppText>
    </Chrome>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideStatic: { backgroundColor: colors.black },
  guideLive: { backgroundColor: 'transparent' },
  hint: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 18,
    textShadowColor: colors.black,
    textShadowRadius: 4,
  },
  bottom: { paddingTop: 18, paddingHorizontal: 24 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 8, backgroundColor: colors.darkLine, borderRadius: radius.badge, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.cameraBlue },
  message: { marginTop: 10 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 14 },
  button: { flex: 1, paddingHorizontal: 8 },
  notReady: { opacity: 0.6 },
});
