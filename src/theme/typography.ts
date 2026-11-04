import { Platform, type TextStyle } from 'react-native';

/**
 * Bundled Inter. Each weight is its own file, referenced by PostScript name,
 * so don't combine these with `fontWeight`.
 */
export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
} as const;

export type FontWeight = keyof typeof fonts;

/** System monospace for chassis numbers. */
export const monospaceFont = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
});

type TextVariant = {
  fontSize: number;
  lineHeight?: number;
  weight: FontWeight;
  /** Cap for Dynamic Type / font scaling so large titles don't clip. */
  maxScale: number;
};

/**
 * Type scale from spec §3. Ranged rows in the spec are split into the sizes
 * the design sources actually use.
 */
export const textVariants = {
  hero: { fontSize: 44, lineHeight: 48, weight: 'bold', maxScale: 1.2 },
  resultNumber: { fontSize: 44, lineHeight: 52, weight: 'bold', maxScale: 1.2 },
  walkthroughTitle: { fontSize: 32, lineHeight: 38, weight: 'bold', maxScale: 1.3 },
  screenTitle: { fontSize: 30, lineHeight: 36, weight: 'bold', maxScale: 1.3 },
  headerTitle: { fontSize: 28, lineHeight: 34, weight: 'bold', maxScale: 1.3 },
  headerTitleSmall: { fontSize: 26, lineHeight: 32, weight: 'bold', maxScale: 1.3 },
  cameraTitle: { fontSize: 24, lineHeight: 30, weight: 'bold', maxScale: 1.3 },
  sheetTitle: { fontSize: 22, lineHeight: 28, weight: 'bold', maxScale: 1.4 },
  bodyLarge: { fontSize: 17, lineHeight: 26, weight: 'regular', maxScale: 2 },
  body: { fontSize: 16, lineHeight: 25, weight: 'regular', maxScale: 2 },
  bodySmall: { fontSize: 15, lineHeight: 22, weight: 'regular', maxScale: 2 },
  rowLabel: { fontSize: 14, lineHeight: 20, weight: 'regular', maxScale: 2 },
  caption: { fontSize: 13, lineHeight: 19, weight: 'regular', maxScale: 2 },
  badge: { fontSize: 12, lineHeight: 16, weight: 'semibold', maxScale: 1.6 },
} as const satisfies Record<string, TextVariant>;

export type TextVariantName = keyof typeof textVariants;

export function textStyle(variant: TextVariantName, weight?: FontWeight): TextStyle {
  const v = textVariants[variant];
  return {
    fontFamily: fonts[weight ?? v.weight],
    fontSize: v.fontSize,
    lineHeight: v.lineHeight,
  };
}
