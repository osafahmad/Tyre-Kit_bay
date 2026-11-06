import {
  describeTreadWear,
  formatWearTitle,
  TREAD_WEAR_CLASSES,
  TREAD_WEAR_PRESENTATION,
} from '../config/treadWearConfig';

describe('tread wear label map', () => {
  test.each([
    ['Center Wear', 'Center Tread Wear', 'Over-inflation', 'Adjust tyre pressure'],
    ['Shoulder Wear Left', 'Shoulder Wear', 'Under-inflation or alignment issue', 'Inspect camber and pressure'],
    ['Shoulder Wear Right', 'Shoulder Wear', 'Under-inflation or alignment issue', 'Inspect camber and pressure'],
    ['Cupping _Scallop Wear', 'Cupping / Scalloped Wear', 'Worn suspension or shock absorbers', 'Inspect dampers and balance'],
    ['Heel and Toe Wear', 'Heel & Toe Wear', 'Suspension misalignment or rotation overdue', 'Rotate tyres and check toe'],
    ['Feather Edge', 'Feathered Wear', 'Toe alignment fault', 'Perform wheel alignment'],
    ['Diagonal Wear', 'Diagonal Wear', 'Wheel imbalance or rear axle misalignment', 'Rebalance wheel assembly'],
    ['Alternate Lug Wear', 'Lug Tread Wear', 'Aggressive torque or uneven load', 'Inspect axle load and drive components'],
    ['Spotty Wear', 'Patchy Spot Wear', 'Skid flat-spotting or out-of-round assembly', 'Inspect roundness and tyre balance'],
    ['Rip Depression and Punch Wear', 'Patchy Spot Wear', 'Skid flat-spotting or out-of-round assembly', 'Inspect roundness and tyre balance'],
  ])('%s → %s', (raw, title, cause, severityHint) => {
    expect(describeTreadWear(raw)).toEqual({ title, cause, severityHint });
  });

  test.each([
    ['Eccentric and Out-of-Round Wear', 'Eccentric and Out-of-Round Wear'],
    ['River_Channel Erosion Wear', 'River Channel Erosion Wear'],
    ['Shoulder Step Chamfer Wear', 'Shoulder Step Chamfer Wear'],
    ['Wavy Wear', 'Wavy Wear'],
  ])('unlisted class %s: clean title, no made-up cause or advice', (raw, title) => {
    expect(describeTreadWear(raw)).toEqual({ title, cause: null, severityHint: null });
  });

  test('every model class resolves to a non-empty title without underscores', () => {
    for (const c of TREAD_WEAR_CLASSES) {
      const { title } = describeTreadWear(c);
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toMatch(/_|\s{2}/);
    }
  });

  test('the map only has real model classes', () => {
    for (const key of Object.keys(TREAD_WEAR_PRESENTATION)) {
      expect(TREAD_WEAR_CLASSES as readonly string[]).toContain(key);
    }
  });

  test('labels the model does not have still get a clean title', () => {
    expect(describeTreadWear('  odd__label  of-THE wear ')).toEqual({
      title: 'Odd Label of-the Wear',
      cause: null,
      severityHint: null,
    });
    expect(describeTreadWear('of wear').title).toBe('Of Wear');
    expect(describeTreadWear('')).toEqual({ title: '', cause: null, severityHint: null });
  });

  test('returns a copy, so callers cannot change the shared map', () => {
    const d = describeTreadWear('Center Wear');
    d.title = 'changed';
    expect(describeTreadWear('Center Wear').title).toBe('Center Tread Wear');
  });

  test('formatWearTitle keeps title case on hyphenated parts', () => {
    expect(formatWearTitle('out-of-round')).toBe('Out-of-Round');
  });
});
