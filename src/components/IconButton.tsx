import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, sizes, type ColorToken } from '../theme';

type Props = {
  icon: LucideIcon;
  /** Required: icon buttons have no visible text. */
  accessibilityLabel: string;
  onPress: () => void;
  color?: ColorToken;
  size?: number;
  testID?: string;
};

export function IconButton({
  icon: Icon,
  accessibilityLabel,
  onPress,
  color = 'white',
  size = 24,
  testID,
}: Props) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [styles.base, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon size={size} color={colors[color]} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
