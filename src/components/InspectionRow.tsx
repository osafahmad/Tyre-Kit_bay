import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import type { TyreStatus } from '../features/inspection/types';
import { AppText } from './AppText';
import { StatusBadge, statusLabels } from './StatusBadge';
import { ANALYSIS_PENDING_LABEL } from '../features/report/summary';

type Props = {
  plate: string | null;
  subtitle: string;
  status: TyreStatus | null;
  isDemo: boolean;
  /** Some tyres are waiting for analysis. Shown as text when there's no status. */
  pending?: boolean;
  onPress: () => void;
  divider: 'top' | 'bottom';
};

/** Saved inspection row on Home and History. */
export function InspectionRow({
  plate,
  subtitle,
  status,
  isDemo,
  pending = false,
  onPress,
  divider,
}: Props) {
  const title = plate ?? 'No plate';
  const note = !status && pending ? ANALYSIS_PENDING_LABEL : null;
  const fullSubtitle = isDemo ? `${subtitle} · Demo data` : subtitle;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${fullSubtitle}${
        status ? `, ${statusLabels[status]}` : note ? `, ${note}` : ''
      }`}
      accessibilityHint="Opens the report"
      style={({ pressed }) => [
        styles.row,
        divider === 'top' ? styles.top : styles.bottom,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.text}>
        <AppText variant="bodySmall" weight="semibold">
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {fullSubtitle}
        </AppText>
      </View>
      {status ? (
        <StatusBadge status={status} />
      ) : note ? (
        <AppText variant="caption" color="textSecondary">
          {note}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingVertical: 10,
  },
  top: { borderTopWidth: 1, borderTopColor: colors.border },
  bottom: { borderBottomWidth: 1, borderBottomColor: colors.border },
  text: { flexShrink: 1, gap: 4 },
});
