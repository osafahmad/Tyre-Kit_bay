/**
 * Colour tokens from TYRE_KIT_BAY_SPEC.md §3. Screens must use these only.
 */
export const colors = {
  black: '#0A0A0A',
  navy: '#12357A',
  cameraBlue: '#4DA3FF',
  white: '#FFFFFF',
  border: '#E3E6EB',
  inputBorder: '#AEB4BE',
  surfaceMuted: '#F4F5F7',
  textSecondary: '#5A606B',
  textBody: '#4A505B',
  textOnDark: '#C7CCD4',
  cameraSurface: '#17191E',
  darkLine: '#2B2F36',
  darkLineStrong: '#3A3F47',
  darkMuted: '#596170',
  searchSurface: '#1C1F24',
  illustrationBlue: '#264C99',
} as const;

/**
 * Tyre condition only. Always pair with a text label.
 */
export const statusColors = {
  good: { background: '#E3F5EB', text: '#14693C' },
  replace_soon: { background: '#FBF0D5', text: '#7A5408' },
  replace_now: { background: '#FBE5E5', text: '#932B2B' },
} as const;

/**
 * Greys used inside SVG artwork in docs/design/source/ that aren't UI tokens.
 * Use only in artwork components.
 */
export const artworkColors = {
  welcomeTyre: '#24272D',
  plateCarWindow: '#111317',
  confirmCarBody: '#1E2126',
  confirmCarWindow: '#0F1114',
  treadPattern: '#30343B',
} as const;

export type ColorToken = keyof typeof colors;
