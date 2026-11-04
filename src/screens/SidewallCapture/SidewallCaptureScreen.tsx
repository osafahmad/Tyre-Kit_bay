import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Viewfinder,
} from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { useInspectionStore, useTyre } from '../../features/inspection/store';
import { tyreName } from '../../features/inspection/positions';
import { inspectionConfig } from '../../config/inspection';
import { canSimulateCapture, simulatedFrames } from '../../features/capture/simulatedCapture';
import { colors } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SidewallCapture'>;

/**
 * 13 Sidewall capture (Sidewall.dc.html). Static in M2: the detector, quality
 * checks and auto-capture arrive in M5.
 */
export function SidewallCaptureScreen({ navigation, route }: Props) {
  const { tyreId } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const found = useTyre(tyreId);
  const setSidewallCaptured = useInspectionStore(s => s.setSidewallCaptured);
  const [flashOn, setFlashOn] = useState(false);
  const status = 'Focusing…';

  if (!found) return null;
  const { inspection, tyre, index } = found;

  const capture = () => {
    if (!canSimulateCapture) return; // Real capture: M5.
    setSidewallCaptured(
      tyre.id,
      simulatedFrames('sidewall', inspectionConfig.capture.sidewallTargetFrames),
      tyre.sidewallDetails,
    );
    navigation.navigate('SidewallCaptured', { tyreId });
  };

  return (
    <View style={styles.root}>
      <DarkTopBar
        onBack={() => navigation.goBack()}
        centreLabel={`Tyre ${index + 1} of ${inspection.tyres.length}`}
      />
      <CameraTitle title={tyreName(tyre.position)} subtitle="Step 1 of 2: sidewall" />
      <Viewfinder>
        <SidewallGuideArt size={Math.min(320, width - 64)} />
        <CameraStatusPill label={status} style={styles.pill} />
        {canSimulateCapture ? (
          <View style={styles.demo}>
            <DemoDataLabel tone="dark" />
          </View>
        ) : null}
        <AppText variant="rowLabel" color="white" align="center" style={styles.hint}>
          Fit the whole tyre inside the circle
        </AppText>
      </Viewfinder>
      <CameraControls
        bottomInset={insets.bottom}
        left={<FlashToggle on={flashOn} onToggle={() => setFlashOn(v => !v)} />}
        centre={<CaptureButton accessibilityLabel="Capture sidewall" onPress={capture} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  pill: { position: 'absolute', top: 16 },
  demo: { position: 'absolute', top: 60, alignSelf: 'center' },
  hint: { position: 'absolute', left: 16, right: 16, bottom: 18 },
});
