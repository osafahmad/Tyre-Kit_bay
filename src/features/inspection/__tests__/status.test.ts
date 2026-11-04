import { inspectionStatus, tyreStatus, worstStatus } from '../status';
import type { TyreInspection, TyreStatus } from '../types';
import { emptySidewallDetails } from '../store';

const base = { treadClass: null, treadDepthMm: null, damageFound: false, ageYears: null };

describe('tyreStatus', () => {
  test('uses the model class when there is one', () => {
    expect(tyreStatus({ ...base, treadClass: 'replace_soon', treadDepthMm: 8 })).toBe('replace_soon');
  });

  test('mm thresholds: at or below 1.6 is Replace now', () => {
    expect(tyreStatus({ ...base, treadDepthMm: 1.6 })).toBe('replace_now');
    expect(tyreStatus({ ...base, treadDepthMm: 1.2 })).toBe('replace_now');
  });

  test('mm thresholds: at or below 4.0 is Replace soon', () => {
    expect(tyreStatus({ ...base, treadDepthMm: 1.7 })).toBe('replace_soon');
    expect(tyreStatus({ ...base, treadDepthMm: 4.0 })).toBe('replace_soon');
  });

  test('mm thresholds: above 4.0 is Good', () => {
    expect(tyreStatus({ ...base, treadDepthMm: 4.1 })).toBe('good');
  });

  test('damage makes it at least Replace soon', () => {
    expect(tyreStatus({ ...base, treadDepthMm: 7, damageFound: true })).toBe('replace_soon');
    expect(tyreStatus({ ...base, treadDepthMm: 1, damageFound: true })).toBe('replace_now');
  });

  test('serious damage is Replace now', () => {
    expect(
      tyreStatus({ ...base, treadDepthMm: 7, damageFound: true, seriousDamage: true }),
    ).toBe('replace_now');
  });

  test('age at or over 6 years makes it at least Replace soon', () => {
    expect(tyreStatus({ ...base, treadDepthMm: 7, ageYears: 6 })).toBe('replace_soon');
    expect(tyreStatus({ ...base, treadDepthMm: 7, ageYears: 5 })).toBe('good');
  });

  test('no tread information gives no status rather than a guess', () => {
    expect(tyreStatus(base)).toBeNull();
  });
});

describe('worst status', () => {
  test('picks the worst', () => {
    expect(worstStatus(['good', 'replace_now', 'replace_soon'])).toBe('replace_now');
    expect(worstStatus([])).toBeNull();
  });

  const tyre = (state: TyreInspection['state'], status?: TyreStatus): TyreInspection => ({
    id: Math.random().toString(),
    position: 'Left front',
    state,
    sidewallFrames: [],
    treadFrames: [],
    errorReason: null,
    sidewallDetails: emptySidewallDetails,
    result: status
      ? {
          status,
          treadDepthMm: null,
          treadConfidence: null,
          wearPattern: null,
          damageFound: null,
          damageConfidence: null,
          size: null,
          rimInches: null,
          make: null,
          model: null,
          dotTin: null,
          ageYears: null,
          ageMonths: null,
        }
      : null,
  });

  test('inspection status ignores skipped and unscanned tyres', () => {
    expect(
      inspectionStatus([tyre('done', 'good'), tyre('skipped'), tyre('waiting'), tyre('failed')]),
    ).toBe('good');
  });

  test('inspection with nothing analysed has no status', () => {
    expect(inspectionStatus([tyre('skipped'), tyre('waiting')])).toBeNull();
  });
});
