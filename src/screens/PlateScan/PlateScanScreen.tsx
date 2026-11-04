import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Keyboard } from 'lucide-react-native';
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
import { plateCandidate } from '../../ml/ocr/textCandidates';
import { plateSearchKey } from '../../features/inspection/validation';
import { feedback } from '../../features/feedback/feedback';
import { colors } from '../../theme';

export const OCR_UNAVAILABLE = "Text reading isn't available. Type it instead.";
export const OCR_FAILING = "Text can't be read right now. Use Capture, or type it.";

/**
 * 08 Scan number plate (PlateScan.dc.html). OCR runs only on the guide box.
 * When the same plate is read 3 times it vibrates and opens Confirm plate.
 * Capture is the fallback. Type it and Skip always work.
 */
export function PlateScanScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const [flashOn, setFlashOn] = useState(false);
  const [live, setLive] = useState(false);
  const [issue, setIssue] = useState<CameraIssue>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const stabilizer = useRef(new ReadStabilizer(plateSearchKey));

  useFocusEffect(
    useCallback(() => {
      stabilizer.current.reset();
      setLeaving(false);
      setMessage(null);
    }, []),
  );

  const found = (plate: string) => {
    setLeaving(true);
    feedback.success('Plate found');
    navigation.navigate('PlateConfirm', { plate });
  };

  const onResult = ({ lines, manual }: ScanResult) => {
    if (leaving) return;
    const value = plateCandidate(lines);
    if (manual) {
      if (value) found(value);
      else setMessage("Couldn't read the plate. Try again, or type it.");
      return;
    }
    const stable = stabilizer.current.push(value);
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
        : 'Place the whole plate inside the box');

  return (
    <View style={styles.root}>
      <DarkTopBar
        onBack={() => navigation.goBack()}
        centreLabel="Step 1 of 3"
        onSkip={() => navigation.navigate('ChassisScan')}
      />
      <CameraTitle title="Scan number plate" subtitle="Optional" />
      <Viewfinder>
        <CaptureCamera
          frameOutput={scanner.frameOutput}
          torchOn={flashOn}
          onLayout={layout.onViewLayout}
          onLiveChange={setLive}
          onIssueChange={setIssue}
        >
          <View
            style={styles.guide}
            onLayout={layout.onGuideLayout}
            accessible
            accessibilityLabel="Plate guide box"
          />
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
          <CaptureButton accessibilityLabel="Capture plate" onPress={capture} disabled={issue !== null} />
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
  guide: {
    width: 260,
    maxWidth: '86%',
    height: 86,
    borderWidth: 3,
    borderColor: colors.cameraBlue,
    borderRadius: 10,
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
