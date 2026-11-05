import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Keyboard, Plus } from 'lucide-react-native';
import {
  AppText,
  CameraControls,
  CameraTitle,
  CaptureButton,
  ControlButton,
  DarkTopBar,
  FlashToggle,
  Viewfinder,
} from '../../components';
import { useRootNavigation } from '../../app/navigation';
import { CaptureCamera, type CameraIssue } from '../../features/capture/CaptureCamera';
import { useTextScanner, type ScanResult } from '../../features/capture/useTextScanner';
import { useGuideLayout } from '../../features/capture/useGuideLayout';
import { ReadStabilizer } from '../../features/capture/readStabilizer';
import { chassisCandidate } from '../../ml/ocr/textCandidates';
import { useInspectionStore } from '../../features/inspection/store';
import { feedback } from '../../features/feedback/feedback';
import {
  CAMERA_IMAGE_ERROR,
  OCR_ERROR,
  OCR_FAILING,
  OCR_UNAVAILABLE,
} from '../PlateScan/PlateScanScreen';
import { colors, radius } from '../../theme';

/**
 * 10 Scan chassis number (ChassisScan.dc.html). Shows `Move closer` when the
 * text is too small. A read is never padded or corrected to 17 characters.
 */
export function ChassisScanScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const setVehicle = useInspectionStore(s => s.setVehicle);
  const [flashOn, setFlashOn] = useState(false);
  const [live, setLive] = useState(false);
  const [issue, setIssue] = useState<CameraIssue>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tooSmall, setTooSmall] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const stabilizer = useRef(new ReadStabilizer());

  useFocusEffect(
    useCallback(() => {
      stabilizer.current.reset();
      setLeaving(false);
      setMessage(null);
      setTooSmall(false);
    }, []),
  );

  const found = (chassis: string) => {
    setLeaving(true);
    setVehicle({ chassis });
    feedback.success('Chassis number found');
    navigation.navigate('VehicleDetails');
  };

  const onResult = ({ lines, crop, manual, failure }: ScanResult) => {
    if (leaving) return;
    if (failure) {
      if (manual) setMessage(failure === 'ocr' ? OCR_ERROR : CAMERA_IMAGE_ERROR);
      return;
    }
    const read = chassisCandidate(lines, crop.height);
    setTooSmall(read.tooSmall);
    if (manual) {
      if (read.value) found(read.value);
      else
        setMessage(
          read.tooSmall
            ? 'Move closer, then try again.'
            : "Couldn't read the chassis number. Try again, or type it.",
        );
      return;
    }
    const stable = stabilizer.current.push(read.value);
    if (stable) found(stable);
  };

  const scanner = useTextScanner({ enabled: live && !leaving, onResult });
  const layout = useGuideLayout(scanner.setGuide);

  const capture = () => {
    if (!scanner.available) return setMessage(OCR_UNAVAILABLE);
    setMessage(null);
    scanner.captureOnce();
  };

  const hint =
    message ??
    (scanner.state === 'unavailable'
      ? OCR_UNAVAILABLE
      : scanner.state === 'error'
        ? OCR_FAILING
        : 'Place the whole number inside the box');

  return (
    <View style={styles.root}>
      <DarkTopBar
        onBack={() => navigation.goBack()}
        centreLabel="Step 2 of 3"
        onSkip={() => navigation.navigate('SelectTyres')}
      />
      <CameraTitle title="Scan chassis number" subtitle="Optional" />
      <Viewfinder>
        <CaptureCamera
          frameOutput={scanner.frameOutput}
          torchOn={flashOn}
          onLayout={layout.onViewLayout}
          onLiveChange={setLive}
          onIssueChange={setIssue}
        >
          <View style={styles.content}>
            <View
              style={styles.guide}
              onLayout={layout.onGuideLayout}
              accessible
              accessibilityLabel="Chassis number guide box"
            />
            {tooSmall ? (
              <View style={styles.closer} accessibilityLiveRegion="polite">
                <Plus size={16} color={colors.navy} strokeWidth={2.5} />
                <AppText variant="rowLabel" weight="semibold">
                  Move closer
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText
            variant="rowLabel"
            color="white"
            align="center"
            style={styles.hint}
            accessibilityLiveRegion="polite"
          >
            {hint}
          </AppText>
        </CaptureCamera>
      </Viewfinder>
      <CameraControls
        bottomInset={insets.bottom}
        left={<FlashToggle on={flashOn} onToggle={() => setFlashOn(v => !v)} available={issue === null} />}
        centre={
          <CaptureButton
            accessibilityLabel="Capture chassis number"
            onPress={capture}
            disabled={issue !== null}
          />
        }
        right={
          <ControlButton
            icon={Keyboard}
            label="Type it"
            onPress={() => navigation.navigate('VehicleDetails')}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  // The guide sits inside this padded box; its onLayout is relative to it.
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  guide: {
    alignSelf: 'stretch',
    height: 84,
    borderWidth: 3,
    borderColor: colors.cameraBlue,
    borderRadius: 10,
  },
  closer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radius.badge,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  hint: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    textShadowColor: colors.black,
    textShadowRadius: 4,
  },
});
