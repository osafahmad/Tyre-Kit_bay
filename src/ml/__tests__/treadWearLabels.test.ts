import { modelManifest } from '../manifest';
import {
  describeTreadWear,
  formatWearTitle,
  NO_DEFECT_CLASS,
  TREAD_WEAR_BACKGROUND,
  TREAD_WEAR_CLASSES,
  TREAD_WEAR_PRESENTATION,
  TREAD_WEAR_STATUS_RULES,
} from '../config/treadWearConfig';

describe('tread wear label map (SSDLite, owner labels.json 2026-11-10)', () => {
  test('background first, then the 15 classes in model index order', () => {
    expect(modelManifest.treadWear!.labels).toEqual([TREAD_WEAR_BACKGROUND, ...TREAD_WEAR_CLASSES]);
    expect(TREAD_WEAR_CLASSES).toHaveLength(15);
    expect(TREAD_WEAR_CLASSES.indexOf('center_wear') + 1).toBe(1);
    expect(TREAD_WEAR_CLASSES.indexOf('normal_even_wear') + 1).toBe(15);
  });

  test.each([
    ['center_wear', 'Center Wear'],
    ['shoulder_wear', 'Shoulder Wear'],
    ['heel_toe_wear', 'Heel Toe Wear'],
    ['cracking_dry_rot', 'Cracking Dry Rot'],
    ['exposed_cords', 'Exposed Cords'],
    ['puncture_object', 'Puncture Object'],
  ])('%s → %s, with no made-up cause or advice', (raw, title) => {
    expect(describeTreadWear(raw)).toEqual({ title, cause: null, severityHint: null });
  });

  test('no owner wording yet: the presentation map is empty', () => {
    expect(TREAD_WEAR_PRESENTATION).toEqual({});
  });

  test('every model class resolves to a non-empty title without underscores', () => {
    for (const c of TREAD_WEAR_CLASSES) {
      const { title } = describeTreadWear(c);
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toMatch(/_|\s{2}/);
    }
  });

  test('status rules and the no-defect class only name real model classes', () => {
    expect(TREAD_WEAR_CLASSES).toContain(NO_DEFECT_CLASS);
    for (const key of Object.keys(TREAD_WEAR_STATUS_RULES)) {
      expect(TREAD_WEAR_CLASSES as readonly string[]).toContain(key);
    }
    expect(TREAD_WEAR_STATUS_RULES).toEqual({
      exposed_cords: { minStatus: 'replace_now', minConfidence: 0.5 },
      sidewall_bulge: { minStatus: 'replace_now', minConfidence: 0.5 },
      cracking_dry_rot: { minStatus: 'replace_soon', minConfidence: null },
      puncture_object: { minStatus: 'replace_soon', minConfidence: null },
    });
  });

  test('Adtronics crack v19 checkpoint: dataset classes land on the owner-confirmed indices (2026-11-12)', () => {
    const labels = modelManifest.treadWear!.labels;
    expect(labels[11]).toBe('sidewall_bulge'); // Bulge
    expect(labels[13]).toBe('cracking_dry_rot'); // Crack, Fine Crack
    expect(labels[14]).toBe('puncture_object'); // Nail
    expect(TREAD_WEAR_STATUS_RULES.sidewall_bulge).toEqual({ minStatus: 'replace_now', minConfidence: 0.5 });
    expect(TREAD_WEAR_STATUS_RULES.cracking_dry_rot?.minStatus).toBe('replace_soon');
    expect(TREAD_WEAR_STATUS_RULES.puncture_object?.minStatus).toBe('replace_soon');
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

  test('formatWearTitle keeps title case on hyphenated parts', () => {
    expect(formatWearTitle('out-of-round')).toBe('Out-of-Round');
  });
});
