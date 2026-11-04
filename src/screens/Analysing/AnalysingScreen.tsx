import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Circle, LoaderCircle } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnalysisRing, AppText, Button, DemoDataLabel } from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { useInspectionStore, useTyre } from '../../features/inspection/store';
import { tyreName } from '../../features/inspection/positions';
import { feedback } from '../../features/feedback/feedback';
import { getAnalyzer, AnalyzerUnavailableError, type AnalysisStep } from '../../ml';
import { colors, sizes } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Analysing'>;

const steps: { key: AnalysisStep; label: string }[] = [
  { key: 'sidewall', label: 'Sidewall details read' },
  { key: 'tread', label: 'Tread checked' },
  { key: 'damage', label: 'Checking for cracks and damage' },
];

/** 18 Analysing on phone (Analysing.dc.html). Advances automatically. */
export function AnalysingScreen({ navigation, route }: Props) {
  const { tyreId } = route.params;
  const insets = useSafeAreaInsets();
  const found = useTyre(tyreId);
  const setResult = useInspectionStore(s => s.setResult);
  const setAnalysisFailed = useInspectionStore(s => s.setAnalysisFailed);
  const updateTyre = useInspectionStore(s => s.updateTyre);
  const resetTyre = useInspectionStore(s => s.resetTyre);
  const analyzer = getAnalyzer();

  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const name = found ? tyreName(found.tyre.position) : '';

  const run = useCallback(async () => {
    const tyre = latestTyre(tyreId);
    if (!tyre) return;
    setError(null);
    setCurrent(0);
    updateTyre(tyreId, { state: 'analysing' });
    try {
      await analyzer.load();
      const result = await analyzer.analyse(
        {
          sidewallFrames: tyre.sidewallFrames,
          treadFrames: tyre.treadFrames,
          userDetails: {
            size: tyre.sidewallDetails.size,
            dotTin: tyre.sidewallDetails.dotTin,
            make: tyre.sidewallDetails.make,
            model: tyre.sidewallDetails.model,
          },
        },
        step => mounted.current && setCurrent(steps.findIndex(s => s.key === step)),
      );
      if (!mounted.current) return;
      setResult(tyreId, result);
      feedback.success('Analysis finished');
      navigation.replace('TyreResult', { inspectionId: found!.inspection.id, tyreId });
    } catch (e) {
      if (!mounted.current) return;
      setAnalysisFailed(tyreId);
      setError(e instanceof AnalyzerUnavailableError ? e.message : null);
      feedback.warning("This tyre couldn't be analysed.");
    }
    // `found` is read once per run; re-running is driven by `attempt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzer, navigation, setAnalysisFailed, setResult, tyreId, updateTyre, attempt]);

  useEffect(() => {
    run();
  }, [run]);

  if (!found) return null;
  const failed = error !== null || found.tyre.state === 'failed';

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 12) + 24 },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.ring}>
          <AnalysisRing progress={failed ? 0 : (current + 0.5) / steps.length} />
        </View>
        <AppText variant="headerTitle" align="center" accessibilityRole="header" style={styles.title}>
          {failed ? "This tyre couldn't be analysed." : 'Analysing tyre'}
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" align="center" style={styles.lead}>
          {failed && error ? error : `${name} · Running on this phone`}
        </AppText>
        {analyzer.isDemo && !failed ? (
          <View style={styles.demo}>
            <DemoDataLabel />
          </View>
        ) : null}
        {failed ? null : (
          <View style={styles.steps} accessibilityLiveRegion="polite">
            {steps.map((s, i) => {
              const Icon = i < current ? Check : i === current ? LoaderCircle : Circle;
              return (
                <View key={s.key} style={styles.step}>
                  <Icon
                    size={22}
                    color={i <= current ? colors.navy : colors.inputBorder}
                    strokeWidth={2.6}
                  />
                  <AppText
                    variant="bodySmall"
                    weight={i === current ? 'semibold' : 'regular'}
                    color={i <= current ? 'black' : 'textSecondary'}
                  >
                    {s.label}
                  </AppText>
                </View>
              );
            })}
          </View>
        )}
      </View>
      {failed ? (
        <View style={styles.actions}>
          <Button label="Try again" onPress={() => setAttempt(a => a + 1)} />
          <Button
            label="Scan this tyre again"
            variant="text"
            onPress={() => {
              resetTyre(tyreId);
              navigation.replace('SidewallCapture', { tyreId });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Latest tyre state without subscribing (read inside the async run). */
function latestTyre(tyreId: string) {
  for (const i of useInspectionStore.getState().inspections) {
    const t = i.tyres.find(x => x.id === tyreId);
    if (t) return t;
  }
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white, paddingHorizontal: sizes.screenPaddingWide },
  body: { flex: 1, justifyContent: 'center', width: '100%', maxWidth: sizes.maxContentWidth, alignSelf: 'center' },
  ring: { alignSelf: 'center' },
  title: { marginTop: 28, marginBottom: 8 },
  lead: { marginBottom: 28 },
  demo: { alignSelf: 'center', marginTop: -16, marginBottom: 20 },
  steps: { borderTopWidth: 1, borderTopColor: colors.border },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actions: { gap: 6 },
});
