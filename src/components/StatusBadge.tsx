import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, TriangleAlert } from 'lucide-react-native';
import { radius, statusColors } from '../theme';
import type { TyreStatus } from '../features/inspection/types';
import { AppText } from './AppText';

export const statusLabels: Record<TyreStatus, string> = {
  good: 'Good',
  replace_soon: 'Replace soon',
  replace_now: 'Replace now',
};

type Props = {
  status: TyreStatus;
  /** `small` for list rows, `medium` for result headers and cards. */
  size?: 'small' | 'medium';
  showIcon?: boolean;
};

/** Tyre condition badge. Colour always comes with the text label. */
export function StatusBadge({ status, size = 'small', showIcon = false }: Props) {
  const palette = statusColors[status];
  const Icon = status === 'good' ? Check : TriangleAlert;
  const medium = size === 'medium';
  return (
    <View
      style={[
        styles.base,
        medium ? styles.medium : styles.small,
        { backgroundColor: palette.background },
      ]}
      accessible
      accessibilityLabel={`Status: ${statusLabels[status]}`}
    >
      {showIcon ? <Icon size={medium ? 15 : 13} color={palette.text} strokeWidth={3} /> : null}
      <AppText
        variant={medium ? 'caption' : 'badge'}
        weight="semibold"
        style={{ color: palette.text }}
        numberOfLines={1}
      >
        {statusLabels[status]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.badge,
  },
  small: { paddingVertical: 5, paddingHorizontal: 10 },
  medium: { paddingVertical: 6, paddingHorizontal: 11 },
});
