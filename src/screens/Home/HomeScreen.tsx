import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanLine } from 'lucide-react-native';
import {
  CommonActions,
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText, Button, InspectionRow, LicensesModal, LICENSES_TITLE, LogoMark } from '../../components';
import type { RootStackParamList, TabParamList } from '../../app/routes';
import {
  scannedTyres,
  useCurrentInspection,
  useInspectionStore,
  useSavedInspections,
} from '../../features/inspection/store';
import { inspectionStatus } from '../../features/inspection/status';
import { formatRelativeDateTime, formatTyreCount } from '../../features/inspection/format';
import { getAnalyzer, isDemoVersion } from '../../ml';
import { resumeRoutes } from '../../features/inspection/resume';
import { currentCameraAccess } from '../../features/capture/useCameraAccess';
import { colors, fonts, radius, sizes } from '../../theme';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

/** 06 Home (Home.dc.html). */
export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const saved = useSavedInspections();
  const current = useCurrentInspection();
  const startInspection = useInspectionStore(s => s.startInspection);
  const discard = useInspectionStore(s => s.discardInspection);
  const recent = saved.slice(0, 3);
  const [licensesOpen, setLicensesOpen] = useState(false);

  const startNew = () => {
    startInspection(getAnalyzer().version);
    // Ask for the camera before the first scan if it hasn't been allowed yet.
    if (currentCameraAccess() === 'can_ask') {
      navigation.navigate('CameraAccess', { next: 'PlateScan' });
    } else {
      navigation.navigate('PlateScan');
    }
  };

  const continueCurrent = () => {
    if (!current) return;
    const routes = [{ name: 'Tabs' as const }, ...resumeRoutes(current)];
    navigation.dispatch(CommonActions.reset({ index: routes.length - 1, routes }));
  };

  const startOver = () => {
    if (!current) return startNew();
    Alert.alert(
      'Start a new inspection?',
      `The unfinished inspection (${current.plate ?? 'No plate'}) will be permanently deleted, including any tyres already scanned. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => {
            discard(current.id);
            startNew();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <LogoMark size={24} labelSize="small" />
        <AppText variant="screenTitle" color="white" accessibilityRole="header" style={styles.title}>
          Ready to inspect
        </AppText>
      </View>

      <View style={styles.card}>
        {current ? (
          <>
            <AppText style={styles.cardTitle}>Unfinished inspection</AppText>
            <AppText variant="rowLabel" color="textSecondary" style={styles.cardText}>
              {`${current.plate ?? 'No plate'} · ${
                current.tyres.length === 0
                  ? 'Tyres not chosen yet'
                  : `${scannedTyres(current).length} of ${current.tyres.length} tyres scanned`
              }`}
            </AppText>
            <Button label="Continue inspection" height={52} onPress={continueCurrent} />
            <Button label="Start new scan" variant="text" onPress={startOver} />
          </>
        ) : (
          <>
            <AppText style={styles.cardTitle}>New inspection</AppText>
            <AppText variant="rowLabel" color="textSecondary" style={styles.cardText}>
              Scan the vehicle, then capture each tyre.
            </AppText>
            <Button label="Start scan" icon={ScanLine} height={52} onPress={startNew} />
          </>
        )}
      </View>

      <View style={styles.recent}>
        <View style={styles.recentHead}>
          <AppText variant="body" weight="semibold" accessibilityRole="header">
            Recent inspections
          </AppText>
          {saved.length > 0 ? (
            <Pressable
              onPress={() => navigation.navigate('History')}
              accessibilityRole="button"
              accessibilityLabel="View all inspections"
              style={styles.viewAll}
            >
              <AppText variant="rowLabel" weight="medium" color="navy">
                View all
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {recent.length === 0 ? (
          <AppText variant="bodySmall" color="textSecondary" style={styles.empty}>
            Your inspections will appear here
          </AppText>
        ) : (
          recent.map(i => (
            <InspectionRow
              key={i.id}
              divider="top"
              plate={i.plate}
              subtitle={`${formatRelativeDateTime(new Date(i.createdAt))} · ${formatTyreCount(
                i.tyres.length,
              )}`}
              status={inspectionStatus(i.tyres)}
              isDemo={isDemoVersion(i.analyzerVersion)}
              pending={i.tyres.some(t => t.state === 'pending_analysis')}
              onPress={() => navigation.navigate('Report', { inspectionId: i.id })}
            />
          ))
        )}
      </View>

      {/* Not in 06-home.png: licence notices (owner decision 2026-11-10), an overlay, not a route. */}
      <Pressable
        onPress={() => setLicensesOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={LICENSES_TITLE}
        style={styles.legal}
        testID="open-licenses"
      >
        <AppText variant="caption" color="textSecondary">
          {LICENSES_TITLE}
        </AppText>
      </Pressable>
      <LicensesModal visible={licensesOpen} onClose={() => setLicensesOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { paddingBottom: 24 },
  header: { backgroundColor: colors.black, paddingHorizontal: 20, paddingBottom: 96 },
  title: { marginTop: 28 },
  card: {
    marginTop: -72,
    marginHorizontal: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.largeCard,
    padding: 20,
    width: undefined,
    maxWidth: sizes.maxContentWidth,
  },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  cardText: { marginTop: 6, marginBottom: 16, lineHeight: 21 },
  recent: { paddingTop: 28, paddingHorizontal: 20 },
  recentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    minHeight: sizes.touchTarget,
  },
  viewAll: { minHeight: sizes.touchTarget, justifyContent: 'center' },
  empty: { paddingVertical: 16 },
  legal: { minHeight: sizes.touchTarget, justifyContent: 'center', alignSelf: 'center', marginTop: 16 },
});
