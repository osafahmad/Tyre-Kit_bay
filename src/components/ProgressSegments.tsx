import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, type ColorToken } from '../theme';

type Props = {
  total: number;
  filled: number;
  activeColor?: ColorToken;
  inactiveColor?: ColorToken;
  accessibilityLabel: string;
};

/** Segmented progress, e.g. walkthrough steps and tyres scanned. */
export function ProgressSegments({
  total,
  filled,
  activeColor = 'navy',
  inactiveColor = 'border',
  accessibilityLabel,
}: Props) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: total, now: filled }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            { backgroundColor: colors[i < filled ? activeColor : inactiveColor] },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: radius.badge },
});
