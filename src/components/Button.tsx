import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radius, sizes } from '../theme';
import { AppText } from './AppText';

type Variant =
  /** Navy, white text. On dark backgrounds it gets a camera blue border. */
  | 'primary'
  /** Walkthrough CTA: taller, larger radius. */
  | 'walkthrough'
  /** Outlined secondary on black, e.g. "Having trouble". */
  | 'secondary'
  /** Text only. Navy on white, white on black. */
  | 'text';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** Background the button sits on. */
  tone?: 'light' | 'dark';
  icon?: LucideIcon;
  disabled?: boolean;
  /** Override for the few places the design uses 52 or 44. */
  height?: number;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  tone = 'light',
  icon: Icon,
  disabled = false,
  height,
  accessibilityHint,
  testID,
  style,
}: Props) {
  const isText = variant === 'text';
  const isSecondary = variant === 'secondary';
  const textColor = isText ? (tone === 'dark' ? 'white' : 'navy') : 'white';

  const containerStyle: ViewStyle = {
    height:
      height ??
      (variant === 'walkthrough'
        ? sizes.walkthroughButton
        : isText
          ? sizes.textButton
          : sizes.primaryButton),
    borderRadius: variant === 'walkthrough' ? radius.walkthroughButton : radius.control,
    backgroundColor: isText || isSecondary ? 'transparent' : colors.navy,
    borderWidth: isSecondary || (variant === 'primary' && tone === 'dark') ? 1 : 0,
    borderColor: isSecondary ? colors.darkMuted : colors.cameraBlue,
  };

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        containerStyle,
        { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <View style={styles.content}>
        {Icon ? <Icon size={20} color={colors[textColor]} strokeWidth={2} /> : null}
        <AppText
          variant={variant === 'walkthrough' ? 'bodyLarge' : isText ? 'bodySmall' : 'body'}
          weight={isText ? 'medium' : 'semibold'}
          color={textColor}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={styles.label}
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    // Button labels sit on one line; lineHeight would push them off-centre.
    lineHeight: undefined,
  },
});
