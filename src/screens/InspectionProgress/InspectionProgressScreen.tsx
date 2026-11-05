import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, DemoDataLabel, ProgressSegments, StatusBadge } from '../../components';
import { resetToReport, useRootNavigation } from '../../app/navigation';
import {
  analysedTyres,
  nextTyre,
  scannedTyres,
  useCurrentInspection,
  useInspectionStore,
} from '../../features/inspection/store';
import { tyreDetailLine } from '../../features/inspection/format';
import type { TyreInspection } from '../../features/inspection/types';
import { isDemoVersion } from '../../ml';
import { ANALYSIS_PENDING_LABEL } from '../../features/report/summary';
import { colors, radius, sizes } from '../../theme';

/** 20 Inspection progress (Progress.dc.html). */
export function InspectionProgressScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const inspection = useCurrentInspection();
  const updateTyre = useInspectionStore(s => s.updateTyre);
  const complete = useInspectionStore(s => s.completeInspection);
  if (!inspection) return null;

  const total = inspection.tyres.length;
  const analysed = analysedTyres(inspection);
  // Pending tyres were captured, so they count as scanned (they have no result yet).
  const scanned = scannedTyres(inspection);
  const next = nextTyre(inspection);
  const demo = isDemoVersion(inspection.analyzerVersion) && analysed.length > 0;

  const scanNext = () => {
    if (!next) return;
    updateTyre(next.id, { state: 'capturing_sidewall' });
    navigation.navigate('SidewallCapture', { tyreId: next.id });
  };

  const viewReport = () => {
    const id = complete();
    if (id) resetToReport(navigation, id);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <AppText variant="rowLabel" color="textOnDark">
          {inspection.plate ?? 'No plate'}
        </AppText>
        <AppText variant="headerTitle" color="white" accessibilityRole="header" style={styles.title}>
          {`${scanned.length} of ${total} tyres scanned`}
        </AppText>
        <ProgressSegments
          total={total}
          filled={scanned.length}
          activeColor="cameraBlue"
          inactiveColor="darkLine"
          accessibilityLabel="Tyres scanned"
        />
        {demo ? (
          <View style={styles.demo}>
            <DemoDataLabel tone="dark" />
          </View>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {inspection.tyres.map(t => (
          <TyreRow
            key={t.id}
            tyre={t}
            isNext={t.id === next?.id}
            onPress={() =>
              navigation.navigate('TyreResult', { inspectionId: inspection.id, tyreId: t.id })
            }
          />
        ))}
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}>
        {next ? (
          <Button label={`Scan ${next.position.toLowerCase()} tyre`} onPress={scanNext} />
        ) : (
          <Button label="View report" onPress={viewReport} />
        )}
        {next && scanned.length > 0 ? (
          <Button label="Finish and view report" variant="text" onPress={viewReport} />
        ) : null}
      </View>
    </View>
  );
}

function TyreRow({
  tyre,
  isNext,
  onPress,
}: {
  tyre: TyreInspection;
  isNext: boolean;
  onPress: () => void;
}) {
  if (tyre.state === 'done' && tyre.result) {
    const detail = tyreDetailLine(tyre.result);
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint="Opens the tyre result"
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={styles.rowText}>
          <AppText variant="bodySmall" weight="semibold">
            {tyre.position}
          </AppText>
          {detail ? (
            <AppText variant="caption" color="textSecondary">
              {detail}
            </AppText>
          ) : null}
        </View>
        <StatusBadge status={tyre.result.status} />
      </Pressable>
    );
  }
  const label =
    tyre.state === 'skipped'
      ? 'Not scanned'
      : tyre.state === 'pending_analysis'
        ? ANALYSIS_PENDING_LABEL
        : isNext
          ? 'Next'
          : 'Waiting';
  return (
    <View style={[styles.row, isNext && styles.next]} accessible accessibilityLabel={`${tyre.position}, ${label}`}>
      <AppText variant="bodySmall" weight={isNext ? 'semibold' : 'medium'}>
        {tyre.position}
      </AppText>
      <AppText variant="caption" weight={isNext ? 'semibold' : 'regular'} color={isNext ? 'navy' : 'textSecondary'}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.black, paddingHorizontal: 24, paddingBottom: 24 },
  title: { marginTop: 4, marginBottom: 16 },
  demo: { marginTop: 12 },
  list: { padding: 20, paddingTop: 16, gap: 10, maxWidth: sizes.maxContentWidth + 40, width: '100%', alignSelf: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  next: { borderWidth: 2, borderColor: colors.navy },
  rowText: { flexShrink: 1, gap: 3 },
  actions: { gap: 6, paddingHorizontal: 20, paddingTop: 8 },
});
