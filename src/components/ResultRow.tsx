import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { AppText } from './AppText';

export const NOT_READ = 'Not read';

type Props = {
  label: string;
  /** null or empty shows `Not read`. Never pass a guessed value. */
  value: string | null;
  last?: boolean;
};

/** Label / value row used on Tyre result. */
export function ResultRow({ label, value, last = false }: Props) {
  const shown = value && value.trim() !== '' ? value : NOT_READ;
  return (
    <View style={[styles.row, !last && styles.divider]} accessible accessibilityLabel={`${label}: ${shown}`}>
      <AppText variant="rowLabel" color="textSecondary">
        {label}
      </AppText>
      <AppText
        variant="rowLabel"
        weight="semibold"
        color={shown === NOT_READ ? 'textSecondary' : 'black'}
        style={styles.value}
      >
        {shown}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 43,
    paddingVertical: 8,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  value: { flexShrink: 1, textAlign: 'right' },
});
