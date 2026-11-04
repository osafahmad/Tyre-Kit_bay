import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Smartphone, WifiOff, type LucideIcon } from 'lucide-react-native';
import { AppText, Button } from '../../components';
import { resetToHome, useRootNavigation } from '../../app/navigation';
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

/** 05 Camera access (Permission.dc.html). The system prompt is wired in M4. */
export function CameraAccessScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const goHome = () => resetToHome(navigation);
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
        <Button label="Allow camera" onPress={goHome} />
        <Button label="Not now" variant="text" onPress={goHome} />
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
