import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import {
  colors,
  textStyle,
  textVariants,
  type ColorToken,
  type FontWeight,
  type TextVariantName,
} from '../theme';

type Props = TextProps & {
  variant?: TextVariantName;
  weight?: FontWeight;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
};

/** All app text goes through this so it uses Inter and the type scale. */
export function AppText({
  variant = 'body',
  weight,
  color = 'black',
  align,
  style,
  maxFontSizeMultiplier,
  ...rest
}: Props) {
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? textVariants[variant].maxScale}
      style={[textStyle(variant, weight), { color: colors[color], textAlign: align }, style]}
    />
  );
}
