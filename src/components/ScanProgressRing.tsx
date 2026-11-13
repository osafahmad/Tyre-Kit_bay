import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { colors } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** 0 (empty) to 1 (full). Clamped. */
  progress: number;
  /** What is filling, e.g. `Plate read progress`. Read out with the percentage. */
  accessibilityLabel: string;
  size?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Scan progress for the camera screens (plate, chassis, sidewall): a ring that
 * fills clockwise from 12 o'clock in camera blue and shows a tick when full.
 * No numbers are drawn. The dark disc keeps it visible over a bright preview.
 */
export function ScanProgressRing({ progress, accessibilityLabel, size = 48, strokeWidth = 5, style }: Props) {
  const target = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const percent = Math.round(target * 100);
  const centre = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  // Starts at the current value, so a ring that mounts part-way doesn't sweep up from zero.
  const fill = useRef(new Animated.Value(target)).current;
  const shown = useRef(target);
  useEffect(() => {
    if (shown.current === target) return;
    shown.current = target;
    const animation = Animated.timing(fill, {
      toValue: target,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      // SVG stroke props aren't on the native driver's supported list.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fill, target]);

  const strokeDashoffset = fill.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[{ width: size, height: size }, style]}
      pointerEvents="none"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <Svg width={size} height={size} fill="none">
        <Circle cx={centre} cy={centre} r={r} fill={colors.black} fillOpacity={0.6} />
        <Circle cx={centre} cy={centre} r={r} stroke={colors.darkLineStrong} strokeWidth={strokeWidth} />
        <G rotation={-90} origin={`${centre}, ${centre}`}>
          <AnimatedCircle
            cx={centre}
            cy={centre}
            r={r}
            stroke={colors.cameraBlue}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            // A round cap would draw a dot at 0.
            strokeOpacity={target === 0 ? 0 : 1}
          />
        </G>
      </Svg>
      {target >= 1 ? (
        <View style={styles.tick}>
          <Check size={Math.round(size * 0.42)} color={colors.white} strokeWidth={3} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tick: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
