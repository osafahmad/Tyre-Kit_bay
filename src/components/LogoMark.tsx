import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme';
import { AppText } from './AppText';

type Props = {
  /** 32 on Welcome, 24 on Home. */
  size?: number;
  labelSize?: 'large' | 'small';
};

/** Placeholder brand mark from docs/design/source/Main.dc.html until the final logo arrives. */
export function LogoMark({ size = 32, labelSize = 'large' }: Props) {
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="Line Up">
      <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <Circle cx={16} cy={16} r={13} stroke={colors.white} strokeWidth={4} />
        <Circle cx={16} cy={16} r={4} fill={colors.cameraBlue} />
      </Svg>
      <AppText
        variant={labelSize === 'large' ? 'body' : 'bodySmall'}
        weight="semibold"
        color="white"
      >
        Line Up
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
