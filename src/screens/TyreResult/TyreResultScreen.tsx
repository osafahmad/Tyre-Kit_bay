import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AppText,
  Button,
  DemoDataLabel,
  IconButton,
  PendingStatusBadge,
  ResultRow,
  STATUS_PENDING_LABEL,
  StatusBadge,
  statusLabels,
} from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { resetToProgress } from '../../app/navigation';
import { useInspection, useInspectionStore } from '../../features/inspection/store';
import { tyreName } from '../../features/inspection/positions';
import {
  formatAge,
  formatDamage,
  formatDepth,
  formatRim,
} from '../../features/inspection/format';
import { isDemoVersion } from '../../ml';
import { AUTOMATED_CHECK_NOTICE } from '../../features/report/reportHtml';
import { colors, sizes } from '../../theme';
import { useTyreInspection } from '../../hooks/useTyreInspection';
import { TreadWearCard, isTreadWearBusy, wearPatternRowValue } from './TreadWearCard';
import { treadLog } from '../../ml/services/treadDebug';

type Props = NativeStackScreenProps<RootStackParamList, 'TyreResult'>;


/** 19 Tyre result (TyreResult.dc.html). */
export function TyreResultScreen({ navigation, route }: Props) {
  const { inspectionId, tyreId } = route.params;
  const insets = useSafeAreaInsets();
  const inspection = useInspection(inspectionId);
  const currentId = useInspectionStore(s => s.currentId);
  const resetTyre = useInspectionStore(s => s.resetTyre);
  // Tread wear runs on this tyre's saved tread frames when the result opens.
  // Shown in its own card. A damage class can raise the status (saved to the store, so the header updates).
  const { treadWear } = useTyreInspection(tyreId, { autoScan: true });
  const tyre = inspection?.tyres.find(t => t.id === tyreId);
  const result = tyre?.result;
  // Diagnostics: when the card and the Wear pattern row actually change on screen.
  const shownWear = result ? wearPatternRowValue(treadWear, result.wearPattern) : null;
  useEffect(() => {
    treadLog(`UI committed: card ${treadWear.status}, Wear pattern row "${shownWear ?? 'Not read'}"`, {
      treadFrames: tyre?.treadFrames.length ?? 0,
    });
  }, [treadWear.status, shownWear, tyre?.treadFrames.length]);
  if (!inspection || !tyre || !result) return null;

  // Buttons only make sense while the inspection is in progress.
  const inProgress = inspection.id === currentId && inspection.completedAt === null;
  const hasDepth = result.treadDepthMm !== null;
  const demo = isDemoVersion(inspection.analyzerVersion);

  const wearBusy = isTreadWearBusy(treadWear);
  const rows: [string, string | null][] = [
    ['Tyre size', result.size],
    ['Rim diameter', formatRim(result.rimInches)],
    ['Make', result.make],
    ['Model', result.model],
    ['DOT/TIN', result.dotTin],
    ['Tyre age', formatAge(result)],
    ['Wear pattern', shownWear],
    ['Cracks or damage', formatDamage(result.damageFound)],
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <View style={styles.headerBody}>
          <AppText variant="rowLabel" color="textOnDark">
            {tyreName(tyre.position)}
          </AppText>
          <View style={styles.mainRow}>
            <AppText variant="resultNumber" color="white" accessibilityRole="header" style={styles.main}>
              {hasDepth
                ? formatDepth(result.treadDepthMm!)
                : wearBusy
                  ? STATUS_PENDING_LABEL
                  : statusLabels[result.status]}
            </AppText>
            {hasDepth ? (
              <View style={styles.badge}>
                {/* The tread check can still raise the status: no `Good` until it has finished (owner 2026-11-12). */}
                {wearBusy ? (
                  <PendingStatusBadge size="medium" />
                ) : (
                  <StatusBadge status={result.status} size="medium" showIcon />
                )}
              </View>
            ) : null}
          </View>
          {hasDepth ? (
            <AppText variant="rowLabel" color="textOnDark" style={styles.caption}>
              Average tread depth
            </AppText>
          ) : null}
          {demo ? (
            <View style={styles.demo}>
              <DemoDataLabel tone="dark" />
            </View>
          ) : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.rows}>
        {rows.map(([label, value], i) => (
          <ResultRow
            key={label}
            label={label}
            value={value}
            pending={label === 'Wear pattern' && wearBusy}
            last={i === rows.length - 1}
          />
        ))}
        <TreadWearCard state={treadWear} />
        <AppText variant="caption" color="textSecondary" style={styles.notice}>
          {AUTOMATED_CHECK_NOTICE}
        </AppText>
      </ScrollView>
      {inProgress ? (
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
          <Button label="Next tyre" onPress={() => resetToProgress(navigation)} />
          <Button
            label="Scan this tyre again"
            variant="text"
            height={44}
            onPress={() => {
              resetTyre(tyre.id);
              navigation.navigate('SidewallCapture', { tyreId: tyre.id });
            }}
          />
        </View>
      ) : (
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.black, paddingHorizontal: 12, paddingBottom: 20 },
  headerBody: { marginTop: 4, marginHorizontal: 12 },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 2,
  },
  main: { flexShrink: 1 },
  badge: { marginBottom: 8 },
  caption: { marginTop: 4 },
  demo: { marginTop: 10 },
  rows: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16, maxWidth: sizes.maxContentWidth + 40, width: '100%', alignSelf: 'center' },
  notice: { marginTop: 16 },
  actions: { gap: 4, paddingHorizontal: 20, paddingTop: 8 },
});
