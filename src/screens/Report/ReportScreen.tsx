import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Info, TriangleAlert } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppText, Button, DemoDataLabel, StatusBadge } from '../../components';
import type { RootStackParamList } from '../../app/routes';
import { resetToHome } from '../../app/navigation';
import { useInspection } from '../../features/inspection/store';
import { formatLongDateTime, tyreDetailLine } from '../../features/inspection/format';
import { reportSummary } from '../../features/report/summary';
import { isDemoVersion } from '../../ml';
import { colors, monospaceFont, radius, sizes, statusColors } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Report'>;

/** 21 Final report (Report.dc.html). PDF sharing is added in M6. */
export function ReportScreen({ navigation, route }: Props) {
  const { inspectionId } = route.params;
  const insets = useSafeAreaInsets();
  const inspection = useInspection(inspectionId);
  if (!inspection) return null;

  const summary = reportSummary(inspection);
  const palette = summary.status ? statusColors[summary.status] : null;
  const SummaryIcon = summary.status === 'good' ? Check : summary.status ? TriangleAlert : Info;
  const demo = isDemoVersion(inspection.analyzerVersion);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <AppText variant="rowLabel" color="textOnDark">
          {`${inspection.plate ?? 'No plate'} · ${formatLongDateTime(new Date(inspection.createdAt))}`}
        </AppText>
        <AppText variant="headerTitle" color="white" accessibilityRole="header" style={styles.title}>
          Tyre report
        </AppText>
        {inspection.chassis ? (
          <AppText variant="caption" color="textOnDark" style={styles.chassis}>
            {inspection.chassis}
          </AppText>
        ) : null}
        {demo ? (
          <View style={styles.demo}>
            <DemoDataLabel tone="dark" />
          </View>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View
          style={[
            styles.summary,
            { backgroundColor: palette?.background ?? colors.surfaceMuted },
          ]}
          accessible
          accessibilityLabel={[summary.headline, summary.detail].filter(Boolean).join('. ')}
        >
          <SummaryIcon size={28} color={palette?.text ?? colors.black} strokeWidth={2} />
          <View style={styles.summaryText}>
            <AppText variant="bodySmall" weight="bold" style={{ color: palette?.text ?? colors.black }}>
              {summary.headline}
            </AppText>
            {summary.detail ? (
              <AppText variant="caption" style={{ color: palette?.text ?? colors.black }}>
                {summary.detail}
              </AppText>
            ) : null}
          </View>
        </View>
        <View style={styles.list}>
          {inspection.tyres.map(t => {
            const scanned = t.state === 'done' && t.result !== null;
            const detail = tyreDetailLine(t.result);
            const content = (
              <>
                <View style={styles.rowText}>
                  <AppText variant="bodySmall" weight="semibold">
                    {t.position}
                  </AppText>
                  {detail ? (
                    <AppText variant="caption" color="textSecondary">
                      {detail}
                    </AppText>
                  ) : null}
                </View>
                {scanned ? (
                  <StatusBadge status={t.result!.status} />
                ) : (
                  <AppText variant="caption" color="textSecondary">
                    Not scanned
                  </AppText>
                )}
              </>
            );
            return scanned ? (
              <Pressable
                key={t.id}
                onPress={() => navigation.navigate('TyreResult', { inspectionId, tyreId: t.id })}
                accessibilityRole="button"
                accessibilityHint="Opens the tyre result"
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
              >
                {content}
              </Pressable>
            ) : (
              <View key={t.id} style={styles.row} accessible>
                {content}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <Button
          label="Share report"
          onPress={() => Alert.alert('Share report', 'PDF sharing is added in a later milestone.')}
        />
        <Button label="Done" variant="text" height={44} onPress={() => resetToHome(navigation)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.black, paddingHorizontal: 24, paddingBottom: 22 },
  title: { marginTop: 4 },
  chassis: { marginTop: 6, fontFamily: monospaceFont },
  demo: { marginTop: 10 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, maxWidth: sizes.maxContentWidth + 40, width: '100%', alignSelf: 'center' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
  },
  summaryText: { flex: 1, gap: 2 },
  list: { marginTop: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    minHeight: 64,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { flexShrink: 1, gap: 3 },
  actions: { gap: 4, paddingHorizontal: 20, paddingTop: 8 },
});
