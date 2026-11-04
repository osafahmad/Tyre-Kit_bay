import React, { useMemo, useState } from 'react';
import { SectionList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search } from 'lucide-react-native';
import { AppText, InspectionRow } from '../../components';
import { useRootNavigation } from '../../app/navigation';
import { useSavedInspections } from '../../features/inspection/store';
import { inspectionStatus } from '../../features/inspection/status';
import {
  formatShortDateTime,
  formatTime,
  formatTyreCount,
  isSameDay,
} from '../../features/inspection/format';
import { plateSearchKey } from '../../features/inspection/validation';
import type { Inspection } from '../../features/inspection/types';
import { isDemoVersion } from '../../ml';
import { colors, fonts, radius } from '../../theme';

/** Live plate filter that ignores case and hyphens. */
export function filterByPlate(inspections: Inspection[], query: string): Inspection[] {
  const key = plateSearchKey(query);
  if (key === '') return inspections;
  return inspections.filter(i => i.plate !== null && plateSearchKey(i.plate).includes(key));
}

/** 07 History (History.dc.html). */
export function HistoryScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const saved = useSavedInspections();
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const now = new Date();
    const matches = filterByPlate(saved, query);
    const today = matches.filter(i => isSameDay(new Date(i.createdAt), now));
    const earlier = matches.filter(i => !isSameDay(new Date(i.createdAt), now));
    return [
      { title: 'Today', data: today, today: true },
      { title: 'Earlier', data: earlier, today: false },
    ].filter(s => s.data.length > 0);
  }, [saved, query]);

  const emptyText =
    saved.length === 0 ? 'Your inspections will appear here' : 'No inspections match that plate';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <AppText variant="headerTitle" color="white" accessibilityRole="header" style={styles.title}>
          History
        </AppText>
        <View style={styles.search}>
          <Search size={18} color={colors.textOnDark} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search number plate"
            placeholderTextColor={colors.textOnDark}
            accessibilityLabel="Search inspections by number plate"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
          />
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <AppText
            variant="caption"
            weight="semibold"
            color="textSecondary"
            accessibilityRole="header"
            style={section.today ? styles.sectionFirst : styles.section}
          >
            {section.title}
          </AppText>
        )}
        renderItem={({ item, section }) => {
          const date = new Date(item.createdAt);
          const when = section.today ? formatTime(date) : formatShortDateTime(date);
          return (
            <InspectionRow
              divider="bottom"
              plate={item.plate}
              subtitle={`${when} · ${formatTyreCount(item.tyres.length)}`}
              status={inspectionStatus(item.tyres)}
              isDemo={isDemoVersion(item.analyzerVersion)}
              onPress={() => navigation.navigate('Report', { inspectionId: item.id })}
            />
          );
        }}
        ListEmptyComponent={
          <AppText variant="bodySmall" color="textSecondary" style={styles.empty}>
            {emptyText}
          </AppText>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.black, paddingHorizontal: 20, paddingBottom: 20 },
  title: { marginBottom: 16 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    backgroundColor: colors.searchSurface,
    borderWidth: 1,
    borderColor: colors.darkLineStrong,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: colors.white,
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingVertical: 10,
  },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  sectionFirst: { marginTop: 12, marginBottom: 4 },
  section: { marginTop: 20, marginBottom: 4 },
  empty: { paddingVertical: 24 },
});
