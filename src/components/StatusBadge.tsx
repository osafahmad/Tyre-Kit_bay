import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Check, TriangleAlert } from 'lucide-react-native';
import { colors, radius, statusColors } from '../theme';
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

/** Shown instead of a status while the tread check that can change it is still running. */
export const STATUS_PENDING_LABEL = 'Analysing…';

/**
 * Neutral badge for a status that isn't final yet (owner request 2026-11-12):
 * no status colour and no tick, so `Good` is never shown before the tread
 * check has finished. For dark headers.
 */
export function PendingStatusBadge({ size = 'small' }: Pick<Props, 'size'>) {
  const medium = size === 'medium';
  return (
    <View
      style={[styles.base, medium ? styles.medium : styles.small, styles.pending]}
      accessible
      accessibilityLabel={`Status: ${STATUS_PENDING_LABEL}`}
      testID="status-pending"
    >
      <ActivityIndicator size="small" color={colors.white} />
      <AppText variant={medium ? 'caption' : 'badge'} weight="semibold" color="white" numberOfLines={1}>
        {STATUS_PENDING_LABEL}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pending: { backgroundColor: colors.darkLine, borderWidth: 1, borderColor: colors.darkLineStrong },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.badge,
  },
  small: { paddingVertical: 5, paddingHorizontal: 10 },
  medium: { paddingVertical: 6, paddingHorizontal: 11 },
});
