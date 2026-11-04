import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button, DemoDataLabel } from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { useTyre } from '../../features/inspection/store';
import { tyreName } from '../../features/inspection/positions';
import { isSimulatedFrame } from '../../features/capture/simulatedCapture';
import { feedback } from '../../features/feedback/feedback';
import { colors, sizes } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'FramesCaptured'>;

const frameCount = (n: number) => (n === 1 ? '1 clear frame' : `${n} clear frames`);

/** 17 Frames captured (TreadDone.dc.html). Counts come from the saved capture. */
export function FramesCapturedScreen({ navigation, route }: Props) {
  const { tyreId } = route.params;
  const insets = useSafeAreaInsets();
  const found = useTyre(tyreId);
  const name = found ? tyreName(found.tyre.position) : '';

  useEffect(() => {
    feedback.success(`Frames captured. ${name} is ready to analyse.`);
  }, [name]);

  if (!found) return null;
  const { tyre } = found;
  const simulated = [...tyre.sidewallFrames, ...tyre.treadFrames].some(isSimulatedFrame);
  const rows = [
    { label: 'Sidewall', count: tyre.sidewallFrames.length },
    { label: 'Tread', count: tyre.treadFrames.length },
  ];

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 12) + 24 },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.check}>
          <Check size={56} color={colors.white} strokeWidth={2.4} />
        </View>
        <AppText variant="screenTitle" color="white" align="center" accessibilityRole="header" style={styles.title}>
          Frames captured
        </AppText>
        <AppText variant="body" color="textOnDark" align="center">
          {`${name} is ready to analyse.`}
        </AppText>
        {simulated ? (
          <View style={styles.demo}>
            <DemoDataLabel tone="dark" />
          </View>
        ) : null}
        <View style={styles.rows}>
          {rows.map(r => (
            <View key={r.label} style={styles.row} accessible accessibilityLabel={`${r.label}: ${frameCount(r.count)}`}>
              <AppText variant="bodySmall" color="white">
                {r.label}
              </AppText>
              <View style={styles.count}>
                <Check size={18} color={colors.cameraBlue} strokeWidth={3} />
                <AppText variant="bodySmall" color="textOnDark">
                  {frameCount(r.count)}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <Button label="Analyse tyre" tone="dark" onPress={() => navigation.replace('Analysing', { tyreId })} />
        <Button
          label="Scan tread again"
          variant="text"
          tone="dark"
          onPress={() => navigation.replace('TreadCapture', { tyreId })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black, paddingHorizontal: sizes.screenPaddingWide },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.navy,
    borderWidth: 3,
    borderColor: colors.cameraBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 28, marginBottom: 8 },
  demo: { marginTop: 12 },
  rows: {
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: colors.darkLine,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: colors.darkLine,
  },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { gap: 6 },
});
