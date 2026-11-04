import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, DarkContentHeader } from '../../components';
import { useRootNavigation } from '../../app/navigation';
import { useCurrentInspection, useInspectionStore } from '../../features/inspection/store';
import {
  DEFAULT_TYRE_COUNT,
  TYRE_COUNTS,
  orderedSelection,
  positionsFor,
  scanButtonLabel,
  tyreLayouts,
  type TyreCount,
} from '../../features/inspection/positions';
import { colors, fonts, radius, sizes } from '../../theme';

function initialCount(positions: string[]): TyreCount {
  return TYRE_COUNTS.find(c => positions.length > 0 && positions.every(p => positionsFor(c).includes(p))) ?? DEFAULT_TYRE_COUNT;
}

function Toggle({
  label,
  selected,
  onPress,
  role,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role: 'radio' | 'checkbox';
  style: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        style,
        selected ? styles.on : styles.off,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <AppText
        style={role === 'radio' ? styles.countText : styles.tyreText}
        color={selected ? 'white' : 'black'}
        align="center"
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/** 12 Select tyres (TyreSetup.dc.html). */
export function SelectTyresScreen() {
  const navigation = useRootNavigation();
  const insets = useSafeAreaInsets();
  const inspection = useCurrentInspection();
  const selectTyres = useInspectionStore(s => s.selectTyres);
  const updateTyre = useInspectionStore(s => s.updateTyre);

  const existing = inspection?.tyres.map(t => t.position) ?? [];
  const [count, setCount] = useState<TyreCount>(initialCount(existing));
  const [selected, setSelected] = useState<Set<string>>(
    new Set(existing.length > 0 ? existing : positionsFor(count)),
  );

  const pickCount = (c: TyreCount) => {
    setCount(c);
    // Changing the number selects every position in that layout.
    setSelected(new Set(positionsFor(c)));
  };

  const toggle = (position: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });

  const ordered = orderedSelection(count, selected);

  const onContinue = () => {
    selectTyres(ordered);
    const first = useInspectionStore
      .getState()
      .inspections.find(i => i.id === inspection?.id)
      ?.tyres.find(t => t.state !== 'done' && t.state !== 'skipped');
    if (first) {
      updateTyre(first.id, { state: 'capturing_sidewall' });
      navigation.navigate('SidewallCapture', { tyreId: first.id });
    }
  };

  return (
    <View style={styles.root}>
      <DarkContentHeader
        title="Select tyres to scan"
        stepLabel="Step 3 of 3"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <AppText variant="rowLabel" weight="semibold" accessibilityRole="header" style={styles.h2}>
          Number of tyres
        </AppText>
        <View style={styles.counts} accessibilityRole="radiogroup">
          {TYRE_COUNTS.map(c => (
            <Toggle
              key={c}
              role="radio"
              label={String(c)}
              selected={c === count}
              onPress={() => pickCount(c)}
              style={styles.count}
            />
          ))}
        </View>
        <AppText
          variant="rowLabel"
          weight="semibold"
          accessibilityRole="header"
          style={[styles.h2, styles.h2Gap]}
        >
          Tyre positions
        </AppText>
        <View style={styles.panel}>
          {tyreLayouts[count].map(row => (
            <View key={row.join()} style={styles.row}>
              {row.map(position => (
                <Toggle
                  key={position}
                  role="checkbox"
                  label={position}
                  selected={selected.has(position)}
                  onPress={() => toggle(position)}
                  style={styles.tyre}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
        {ordered.length > 0 ? (
          <Button label={scanButtonLabel(ordered.length)} onPress={onContinue} />
        ) : (
          <View style={styles.none} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <AppText variant="bodySmall" weight="medium">
              Select at least one tyre
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { flexGrow: 1, padding: 20, maxWidth: sizes.maxContentWidth, width: '100%', alignSelf: 'center' },
  h2: { marginBottom: 10 },
  h2Gap: { marginTop: 24 },
  counts: { flexDirection: 'row', gap: 8 },
  count: {
    flex: 1,
    minHeight: sizes.input,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  panel: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.largeCard,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  row: { flexDirection: 'row', gap: 36 },
  tyre: {
    flex: 1,
    minHeight: 64,
    padding: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tyreText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  on: { backgroundColor: colors.navy, borderColor: colors.navy },
  off: { backgroundColor: colors.white, borderColor: colors.inputBorder },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
  none: {
    minHeight: sizes.primaryButton,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
