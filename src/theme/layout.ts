/** 4 and 8 point spacing scale. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  control: 12,
  card: 12,
  largeCard: 16,
  walkthroughButton: 14,
  cameraFrame: 20,
  sheet: 24,
  walkthroughSheet: 28,
  badge: 999,
} as const;

export const sizes = {
  /** Minimum touch target. */
  touchTarget: 44,
  primaryButton: 56,
  walkthroughButton: 58,
  textButton: 48,
  input: 52,
  screenPadding: 20,
  screenPaddingWide: 24,
  /** Content stops growing past this on tablets. */
  maxContentWidth: 560,
} as const;
