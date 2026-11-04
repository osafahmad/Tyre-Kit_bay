import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Smartphone, WifiOff, type LucideIcon } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button } from '../../components';
import { resetToHome } from '../../app/navigation';
import type { RootStackParamList } from '../../app/routes';
import { requestCameraAccess } from '../../features/capture/useCameraAccess';
import { colors, sizes } from '../../theme';

function Note({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <View style={styles.note}>
      <Icon size={22} color={colors.navy} strokeWidth={2} />
      <AppText variant="bodySmall" style={styles.noteText}>
        {text}
      </AppText>
    </View>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'CameraAccess'>;

/**
 * 05 Camera access (Permission.dc.html). `Allow camera` shows the system
 * prompt. On first launch either answer goes Home; when a scan is starting it
 * goes on to the scan, where typing and Skip still work without the camera.
 */
export function CameraAccessScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const next = route.params?.next;
  const [asking, setAsking] = useState(false);
  const goOn = () => (next ? navigation.replace(next) : resetToHome(navigation));
  const allow = async () => {
    setAsking(true);
    await requestCameraAccess();
    setAsking(false);
    goOn();
  };
  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 12) + 20 },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.iconBox}>
          <Camera size={34} color={colors.cameraBlue} strokeWidth={1.8} />
        </View>
        <AppText variant="screenTitle" accessibilityRole="header" style={styles.title}>
          Allow camera access
        </AppText>
        <AppText variant="body" color="textSecondary">
          The camera reads number plates, chassis numbers, and tyres.
        </AppText>
        <View style={styles.notes}>
          <Note icon={Smartphone} text="Tyre scans are analysed on this phone." />
          <Note icon={WifiOff} text="Inspections work without an internet connection." />
        </View>
      </View>
      <View style={styles.actions}>
        <Button label="Allow camera" onPress={allow} disabled={asking} />
        <Button label="Not now" variant="text" onPress={goOn} disabled={asking} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white, paddingHorizontal: sizes.screenPaddingWide },
  body: { flex: 1, justifyContent: 'center', maxWidth: sizes.maxContentWidth },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 28, marginBottom: 12 },
  notes: { gap: 18, marginTop: 32 },
  note: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  noteText: { flex: 1 },
  actions: { gap: 8 },
});
