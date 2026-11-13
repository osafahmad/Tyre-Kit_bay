import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '../theme';
import { AppText } from './AppText';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** Steps finished so far. Clamped to 0…`total`. */
  value: number;
  total: number;
  /** Shown under the ring and read out before the count, e.g. `Scanning sidewall frames`. */
  label: string;
  size?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Ring that fills clockwise from 12 o'clock, with the count in its centre and a
 * label below. For dark camera screens: the disc behind the count keeps it
 * readable over the live preview.
 */
export function CircularProgress({ value, total, label, size = 84, strokeWidth = 6, style }: Props) {
  const safeTotal = Math.max(1, total);
  const now = Math.max(0, Math.min(safeTotal, Math.round(value)));
  const centre = size / 2;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  // Starts at the current value, so a ring that mounts part-way doesn't sweep up from zero.
  const progress = useRef(new Animated.Value(now / safeTotal)).current;
  const shown = useRef(now / safeTotal);
  useEffect(() => {
    const target = now / safeTotal;
    if (shown.current === target) return;
    shown.current = target;
    const animation = Animated.timing(progress, {
      toValue: target,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      // SVG stroke props aren't on the native driver's supported list.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, now, safeTotal]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[styles.root, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${now} of ${safeTotal}`}
      accessibilityValue={{ min: 0, max: safeTotal, now }}
      accessibilityLiveRegion="polite"
    >
      <View style={{ width: size, height: size }}>
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
              strokeOpacity={now === 0 ? 0 : 1}
            />
          </G>
        </Svg>
        <View style={styles.count}>
          <AppText variant="rowLabel" weight="semibold" color="white">
            {`${now}/${safeTotal}`}
          </AppText>
        </View>
      </View>
      <AppText variant="caption" weight="semibold" color="white" align="center" style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 8 },
  count: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  label: { textShadowColor: colors.black, textShadowRadius: 4 },
});
