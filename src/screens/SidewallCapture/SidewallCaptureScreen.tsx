import React, { useCallback, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useCameraDevice } from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AppText,
  CameraControls,
  CameraStatusPill,
  CameraTitle,
  CaptureButton,
  DarkTopBar,
  DemoDataLabel,
  FlashToggle,
  SidewallGuideArt,
  SidewallGuideRing,
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
import { colors } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SidewallCapture'>;

export const SIDEWALL_HINT = 'Fit the whole tyre inside the circle';

/**
 * 13 Sidewall capture (Sidewall.dc.html). Frames are checked for light,
 * sharpness and steadiness; the sharpest ones are saved. Without the tyre
 * detector (M7) capture starts from the Capture button.
 */
export function SidewallCaptureScreen(props: Props) {
  const device = useCameraDevice('back');
  const found = useTyre(props.route.params.tyreId);
  if (!found) return null;
  // Development builds without a camera (simulators) walk the flow with fake frames.
  return canSimulateCapture && !device ? <SimulatedSidewall {...props} /> : <LiveSidewall {...props} />;
}

function Chrome({
  navigation,
  route,
  children,
  controls,
}: Props & { children: React.ReactNode; controls: React.ReactNode }) {
  const found = useTyre(route.params.tyreId)!;
  return (
    <View style={styles.root}>
      <DarkTopBar
        onBack={() => navigation.goBack()}
        centreLabel={`Tyre ${found.index + 1} of ${found.inspection.tyres.length}`}
      />
      <CameraTitle title={tyreName(found.tyre.position)} subtitle="Step 1 of 2: sidewall" />
      <Viewfinder>{children}</Viewfinder>
      {controls}
    </View>
  );
}

function LiveSidewall(props: Props) {
  const { navigation, route } = props;
  const { tyreId } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const found = useTyre(tyreId)!;
  const [flashOn, setFlashOn] = useState(false);
  const [live, setLive] = useState(false);
  const [issue, setIssue] = useState<CameraIssue>(null);
  const [saveError, setSaveError] = useState<'storage' | 'other' | null>(null);
  const blocked = useCaptureBlock(s => s.blocked);
  const focused = useIsFocused();
  const storage = useStorageCheck();
  const device = useCameraDevice('back');

  const capture = useTyreCapture({
    stage: 'sidewall',
    active: live && focused && !blocked && storage.enough && saveError === null,
  });
  const layout = useGuideLayout(capture.setGuide);

  useStageOutcome({
    outcome: capture.snapshot.outcome,
    inspectionId: found.inspection.id,
    tyreId,
    stage: 'sidewall',
    onSaved: useCallback(() => navigation.replace('SidewallCaptured', { tyreId }), [navigation, tyreId]),
    onProblem: useCallback(
      (reason: CaptureErrorReason) =>
        navigation.replace('CaptureProblem', { tyreId, stage: 'sidewall', reason }),
      [navigation, tyreId],
    ),
    onSaveError: setSaveError,
  });

  const status = captureStatusText('sidewall', capture.snapshot);
  const problem = saveError ?? (storage.enough ? null : 'storage');

  return (
    <Chrome
      {...props}
      controls={
        <CameraControls
          bottomInset={insets.bottom}
          left={
            <FlashToggle
              on={flashOn}
              onToggle={() => setFlashOn(v => !v)}
              available={issue === null && !!device?.hasTorch}
            />
          }
          centre={
            <CaptureButton
              accessibilityLabel="Capture sidewall"
              onPress={capture.start}
              disabled={issue !== null || problem !== null || capture.snapshot.collecting}
            />
          }
        />
      }
    >
      <CaptureCamera
        frameOutput={capture.frameOutput}
        torchOn={flashOn}
        onLayout={layout.onViewLayout}
        onLiveChange={setLive}
        onIssueChange={setIssue}
      >
        <View onLayout={layout.onGuideLayout} accessible accessibilityLabel="Tyre guide circle">
          <SidewallGuideRing size={Math.min(320, width - 64)} />
        </View>
        <CameraStatusPill label={status.label} showCheck={status.ok} style={styles.pill} />
        {capture.snapshot.collecting ? (
          <AppText variant="caption" color="white" style={styles.count} accessibilityLiveRegion="polite">
            {`${capture.snapshot.accepted} of ${inspectionConfig.capture.sidewallTargetFrames} frames`}
          </AppText>
        ) : null}
        <AppText variant="rowLabel" color="white" align="center" style={styles.hint}>
          {SIDEWALL_HINT}
        </AppText>
      </CaptureCamera>
      {problem ? (
        <SaveProblemOverlay
          kind={problem}
          onRetry={async () => {
            if (saveError) navigation.replace('SidewallCapture', { tyreId });
            else await storage.recheck();
          }}
        />
      ) : null}
    </Chrome>
  );
}

/** Development only: no camera, fake frames, labelled Demo data. */
function SimulatedSidewall(props: Props) {
  const { navigation, route } = props;
  const { tyreId } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const found = useTyre(tyreId)!;
  const setSidewallCaptured = useInspectionStore(s => s.setSidewallCaptured);
  const [flashOn, setFlashOn] = useState(false);

  const capture = () => {
    setSidewallCaptured(
      tyreId,
      simulatedFrames('sidewall', inspectionConfig.capture.sidewallTargetFrames),
      found.tyre.sidewallDetails,
    );
    navigation.replace('SidewallCaptured', { tyreId });
  };

  return (
    <Chrome
      {...props}
      controls={
        <CameraControls
          bottomInset={insets.bottom}
          left={<FlashToggle on={flashOn} onToggle={() => setFlashOn(v => !v)} />}
          centre={<CaptureButton accessibilityLabel="Capture sidewall" onPress={capture} />}
        />
      }
    >
      <SidewallGuideArt size={Math.min(320, width - 64)} />
      <CameraStatusPill label="Focusing…" style={styles.pill} />
      <View style={styles.demo}>
        <DemoDataLabel tone="dark" />
      </View>
      <AppText variant="rowLabel" color="white" align="center" style={styles.hint}>
        {SIDEWALL_HINT}
      </AppText>
    </Chrome>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  pill: { position: 'absolute', top: 16 },
  demo: { position: 'absolute', top: 60, alignSelf: 'center' },
  count: { position: 'absolute', top: 60, alignSelf: 'center' },
  hint: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    textShadowColor: colors.black,
    textShadowRadius: 4,
  },
});
