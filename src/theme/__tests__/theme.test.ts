import { colors, fonts, statusColors, textVariants, radius, sizes } from '..';

// Values copied from TYRE_KIT_BAY_SPEC.md §3 so a drift in the theme fails here.
test('colour tokens match the spec', () => {
  expect(colors).toEqual({
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
  });
});

test('status colours match the spec', () => {
  expect(statusColors).toEqual({
    good: { background: '#E3F5EB', text: '#14693C' },
    replace_soon: { background: '#FBF0D5', text: '#7A5408' },
    replace_now: { background: '#FBE5E5', text: '#932B2B' },
  });
});

test('Inter is bundled in the four required weights', () => {
  expect(Object.values(fonts)).toEqual([
    'Inter-Regular',
    'Inter-Medium',
    'Inter-SemiBold',
    'Inter-Bold',
  ]);
});

test('type scale matches the spec', () => {
  const pick = (k: keyof typeof textVariants) => {
    const { fontSize, lineHeight, weight } = textVariants[k];
    return [fontSize, lineHeight, weight];
  };
  expect(pick('hero')).toEqual([44, 48, 'bold']);
  expect(pick('resultNumber')).toEqual([44, 52, 'bold']);
  expect(pick('walkthroughTitle')).toEqual([32, 38, 'bold']);
  expect(pick('screenTitle')).toEqual([30, 36, 'bold']);
  expect(pick('headerTitle')).toEqual([28, 34, 'bold']);
  expect(pick('headerTitleSmall')).toEqual([26, 32, 'bold']);
  expect(pick('cameraTitle')).toEqual([24, 30, 'bold']);
  expect(pick('sheetTitle')).toEqual([22, 28, 'bold']);
  expect(pick('bodyLarge')).toEqual([17, 26, 'regular']);
});

test('component sizes match the spec', () => {
  expect(sizes.primaryButton).toBe(56);
  expect(sizes.walkthroughButton).toBe(58);
  expect(sizes.touchTarget).toBeGreaterThanOrEqual(44);
  expect(radius.control).toBe(12);
  expect(radius.largeCard).toBe(16);
  expect(radius.walkthroughButton).toBe(14);
  expect(radius.badge).toBe(999);
});
