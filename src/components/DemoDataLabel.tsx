import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

/**
 * Required on anything showing demo analyzer output (spec §6 safety rule).
 */
export function DemoDataLabel({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <View
      style={[styles.pill, dark ? styles.dark : styles.light]}
      accessible
      accessibilityLabel="Demo data. These results are not from a real analysis."
    >
      <AppText variant="badge" weight="semibold" color={dark ? 'white' : 'black'}>
        Demo data
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.badge,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  light: { backgroundColor: colors.surfaceMuted, borderColor: colors.inputBorder },
  dark: { backgroundColor: colors.black, borderColor: colors.darkMuted },
});
