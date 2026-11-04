import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { colors, radius } from '../../theme';

/**
 * 10 Scan chassis number (ChassisScan.dc.html). Static in M2; camera and OCR
 * arrive in M4. `Move closer` shows when OCR says the text is too small.
 */
export function ChassisScanScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const [flashOn, setFlashOn] = useState(false);
  const textTooSmall = false;

  return (
    <View style={styles.root}>
      <DarkTopBar
        onBack={() => navigation.goBack()}
        centreLabel="Step 2 of 3"
        onSkip={() => navigation.navigate('SelectTyres')}
      />
      <CameraTitle title="Scan chassis number" subtitle="Optional" />
      <Viewfinder style={styles.viewfinder}>
        <View style={styles.guide} accessibilityLabel="Chassis number guide box" />
        {textTooSmall ? (
          <View style={styles.closer} accessibilityLiveRegion="polite">
            <Plus size={16} color={colors.navy} strokeWidth={2.5} />
            <AppText variant="rowLabel" weight="semibold">
              Move closer
            </AppText>
          </View>
        ) : null}
        <AppText variant="rowLabel" color="white" align="center" style={styles.hint}>
          Place the whole number inside the box
        </AppText>
      </Viewfinder>
      <CameraControls
        bottomInset={insets.bottom}
        left={<FlashToggle on={flashOn} onToggle={() => setFlashOn(v => !v)} />}
        centre={
          <CaptureButton
            accessibilityLabel="Capture chassis number"
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
  viewfinder: { paddingHorizontal: 16, gap: 16 },
  guide: {
    width: '100%',
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
  hint: { position: 'absolute', left: 16, right: 16, bottom: 18 },
});
