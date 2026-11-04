import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight,
  Camera,
  Droplet,
  Hand,
  Ruler,
  Scan,
  Sun,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button } from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { resetToProgress } from '../../app/navigation';
import { useInspectionStore } from '../../features/inspection/store';
import type { CaptureErrorReason } from '../../features/inspection/types';
import { colors, sizes } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'CaptureProblem'>;

type Tip = { icon: LucideIcon; text: string };

/** Reason table from spec §4.16. */
export const captureProblems: Record<CaptureErrorReason, { title: string; tips: Tip[] }> = {
  dark: {
    title: 'Too dark to read the tread',
    tips: [
      { icon: Zap, text: 'Turn on the flash' },
      { icon: ArrowRight, text: 'Move more slowly' },
      { icon: Droplet, text: 'Wipe away mud or water' },
    ],
  },
  blur: {
    title: 'The frames are too blurred',
    tips: [
      { icon: Hand, text: 'Hold the phone steady' },
      { icon: ArrowRight, text: 'Move more slowly' },
      { icon: Camera, text: 'Clean the camera lens' },
    ],
  },
  distance: {
    title: 'The tyre is out of range',
    tips: [
      { icon: Ruler, text: 'Follow the distance message' },
      { icon: Scan, text: 'Keep the tyre inside the guide' },
    ],
  },
  not_found: {
    title: "The tyre wasn't detected",
    tips: [
      { icon: Scan, text: 'Keep the tyre inside the guide' },
      { icon: Sun, text: 'Try more light' },
    ],
  },
};

/** 16 Capture problem (TreadRetry.dc.html). Shows the real reason. */
export function CaptureProblemScreen({ navigation, route }: Props) {
  const { tyreId, stage, reason } = route.params;
  const insets = useSafeAreaInsets();
  const skipTyre = useInspectionStore(s => s.skipTyre);
  const problem = captureProblems[reason];

  const retry = () =>
    navigation.replace(stage === 'sidewall' ? 'SidewallCapture' : 'TreadCapture', { tyreId });

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 12) + 24 },
      ]}
    >
      <ScrollView contentContainerStyle={styles.body}>
        {/* Warning icon kept off the status palette: amber is for tyre condition only. */}
        <View style={styles.iconBox}>
          <TriangleAlert size={36} color={colors.white} strokeWidth={2} />
        </View>
        <AppText
          variant="screenTitle"
          color="white"
          accessibilityRole="header"
          style={styles.title}
        >
          {problem.title}
        </AppText>
        <AppText variant="body" color="textOnDark" style={styles.lead}>
          Too few clear frames were captured. Try these before scanning again.
        </AppText>
        <View style={styles.tips}>
          {problem.tips.map(tip => (
            <View key={tip.text} style={styles.tip}>
              <tip.icon size={22} color={colors.cameraBlue} strokeWidth={2} />
              <AppText variant="bodySmall" color="white" style={styles.tipText}>
                {tip.text}
              </AppText>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Button
          label={stage === 'sidewall' ? 'Scan sidewall again' : 'Scan tread again'}
          tone="dark"
          onPress={retry}
        />
        <Button
          label="Skip this tyre"
          variant="text"
          tone="dark"
          onPress={() => {
            skipTyre(tyreId);
            resetToProgress(navigation);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black, paddingHorizontal: sizes.screenPaddingWide },
  body: { flexGrow: 1, justifyContent: 'center', maxWidth: sizes.maxContentWidth },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.cameraBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 24, marginBottom: 10 },
  lead: { marginBottom: 28, lineHeight: 24 },
  tips: { gap: 14 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipText: { flex: 1 },
  actions: { gap: 6 },
});
