import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Check, Zap, ZapOff, type LucideIcon } from 'lucide-react-native';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

/** 76pt ring capture button from the camera designs. */
export function CaptureButton({
  onPress,
  accessibilityLabel,
  disabled = false,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.capture, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <View style={styles.captureInner} />
    </Pressable>
  );
}

/** Icon over a small label, e.g. Flash, Type it. */
export function ControlButton({
  icon: Icon,
  label,
  onPress,
  accessibilityLabel,
  selected,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={selected === undefined ? 'button' : 'switch'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected, disabled }}
      style={({ pressed }) => [styles.control, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <Icon size={24} color={colors.cameraBlue} strokeWidth={2} />
      <AppText variant="badge" weight="medium" color="white">
        {label}
      </AppText>
    </Pressable>
  );
}

export function FlashToggle({
  on,
  onToggle,
  available = true,
}: {
  on: boolean;
  onToggle: () => void;
  available?: boolean;
}) {
  if (!available) {
    return (
      <ControlButton
        icon={ZapOff}
        label="No flash"
        onPress={() => {}}
        accessibilityLabel="This device has no flash"
        disabled
      />
    );
  }
  return (
    <ControlButton
      icon={Zap}
      label={on ? 'Flash on' : 'Flash off'}
      accessibilityLabel="Flash"
      selected={on}
      onPress={onToggle}
    />
  );
}

/** Navy status pill shown over camera previews. */
export function CameraStatusPill({
  label,
  showCheck = false,
  style,
}: {
  label: string;
  showCheck?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.pill, style]}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      {showCheck ? <Check size={16} color={colors.white} strokeWidth={3} /> : null}
      <AppText variant="caption" weight="semibold" color="white">
        {label}
      </AppText>
    </View>
  );
}

/** Dark rounded viewfinder area shared by all camera screens. */
export function Viewfinder({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.viewfinder, style]}>{children}</View>;
}

/** Three-column controls row: left, centre, right. */
export function CameraControls({
  left,
  centre,
  right,
  bottomInset,
}: {
  left?: React.ReactNode;
  centre?: React.ReactNode;
  right?: React.ReactNode;
  bottomInset: number;
}) {
  return (
    <View style={[styles.controls, { paddingBottom: Math.max(bottomInset, 16) + 16 }]}>
      <View style={[styles.slot, styles.slotStart]}>{left}</View>
      <View style={styles.slot}>{centre}</View>
      <View style={[styles.slot, styles.slotEnd]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  capture: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.cameraBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.white },
  control: {
    minWidth: 60,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    minWidth: 116,
    justifyContent: 'center',
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.cameraBlue,
    borderRadius: radius.badge,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  viewfinder: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: radius.cameraFrame,
    backgroundColor: colors.cameraSurface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 24,
  },
  slot: { flex: 1, alignItems: 'center' },
  slotStart: { alignItems: 'flex-start' },
  slotEnd: { alignItems: 'flex-end' },
});
