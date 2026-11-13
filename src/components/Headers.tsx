import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, sizes } from '../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

type TopBarProps = {
  onBack?: () => void;
  /** Small centred label, e.g. "Step 1 of 3", "Tyre 1 of 4". */
  centreLabel?: string;
  /** Right-aligned small label when there's no Skip. */
  rightLabel?: string;
  onSkip?: () => void;
  skipLabel?: string;
  /** Extra space under the safe area to match the design. */
  topOffset?: number;
};

/** Back / label / Skip row on black screens. */
export function DarkTopBar({
  onBack,
  centreLabel,
  rightLabel,
  onSkip,
  skipLabel = 'Skip',
  topOffset = 8,
}: TopBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + topOffset }]}>
      {onBack ? (
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={onBack} />
      ) : (
        <View style={styles.spacer} />
      )}
      {centreLabel ? (
        <AppText variant="caption" color="textOnDark">
          {centreLabel}
        </AppText>
      ) : null}
      {onSkip ? (
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel={skipLabel}
          style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AppText variant="bodySmall" weight="semibold" color="white">
            {skipLabel}
          </AppText>
        </Pressable>
      ) : rightLabel ? (
        <AppText variant="caption" color="textOnDark" style={styles.rightLabel}>
          {rightLabel}
        </AppText>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

/**
 * Back chevron for flow screens without a top bar (owner request 2026-11-13).
 * `tone` is the background it sits on. `overlay` pins it top-left over
 * artwork or centred content, below the safe area.
 */
export function BackButton({
  onPress,
  tone = 'dark',
  overlay = false,
}: {
  onPress: () => void;
  tone?: 'dark' | 'light';
  overlay?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const button = (
    <IconButton
      icon={ChevronLeft}
      accessibilityLabel="Back"
      onPress={onPress}
      color={tone === 'dark' ? 'white' : 'black'}
      testID="back-button"
    />
  );
  if (!overlay) return button;
  return <View style={[styles.overlay, { top: insets.top + 8 }]}>{button}</View>;
}

/** Centred camera title and subtitle under the top bar. */
export function CameraTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.cameraTitle}>
      <AppText variant="cameraTitle" color="white" align="center" accessibilityRole="header">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="rowLabel" color="textOnDark" align="center" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

/** Black header with back, step label and a left-aligned title (Vehicle, Select tyres). */
export function DarkContentHeader({
  title,
  onBack,
  stepLabel,
}: {
  title: string;
  onBack: () => void;
  stepLabel?: string;
}) {
  return (
    <View style={styles.contentHeader}>
      <DarkTopBar onBack={onBack} rightLabel={stepLabel} />
      <AppText
        variant="headerTitleSmall"
        color="white"
        accessibilityRole="header"
        style={styles.contentTitle}
      >
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  spacer: { width: sizes.touchTarget, height: sizes.touchTarget },
  overlay: { position: 'absolute', left: 12, zIndex: 1 },
  skip: {
    minWidth: sizes.touchTarget,
    height: sizes.touchTarget,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightLabel: { paddingRight: 12 },
  cameraTitle: { paddingTop: 4, paddingHorizontal: 24, paddingBottom: 16 },
  subtitle: { marginTop: 4 },
  contentHeader: { backgroundColor: colors.black, paddingBottom: 20 },
  contentTitle: { marginTop: 0, marginHorizontal: 24 },
});
