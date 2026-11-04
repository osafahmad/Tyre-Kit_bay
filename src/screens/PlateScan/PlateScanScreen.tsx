import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Keyboard } from 'lucide-react-native';
import {
  AppText,
  CameraControls,
  CameraTitle,
  CaptureButton,
  ControlButton,
  DarkTopBar,
  FlashToggle,
  PlateCarArt,
  Viewfinder,
} from '../../components';
import { useRootNavigation } from '../../app/navigation';
import { colors } from '../../theme';

/**
 * 08 Scan number plate (PlateScan.dc.html). Static in M2: the live camera and
 * OCR arrive in M4, so Capture can't read anything yet and goes to manual entry.
 */
export function PlateScanScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const [flashOn, setFlashOn] = useState(false);

  return (
    <View style={styles.root}>
      <DarkTopBar
        onBack={() => navigation.goBack()}
        centreLabel="Step 1 of 3"
        onSkip={() => navigation.navigate('ChassisScan')}
      />
      <CameraTitle title="Scan number plate" subtitle="Optional" />
      <Viewfinder>
        <PlateCarArt />
        <View style={styles.guide} accessibilityLabel="Plate guide box" />
        <AppText variant="rowLabel" color="white" align="center" style={styles.hint}>
          Place the whole plate inside the box
        </AppText>
      </Viewfinder>
      <CameraControls
        bottomInset={insets.bottom}
        left={<FlashToggle on={flashOn} onToggle={() => setFlashOn(v => !v)} />}
        centre={
          <CaptureButton
            accessibilityLabel="Capture plate"
            onPress={() => navigation.navigate('VehicleDetails')}
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
  guide: {
    position: 'absolute',
    top: '50%',
    marginTop: 28,
    width: 260,
    height: 86,
    borderWidth: 3,
    borderColor: colors.cameraBlue,
    borderRadius: 10,
  },
  hint: { position: 'absolute', left: 16, right: 16, bottom: 18 },
});
