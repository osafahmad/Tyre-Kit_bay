import { bestCropRead, cropRead, paddedCropRect, scoreCropRead, CROP_ROTATIONS } from '../sidewallCropOcr';
import { filterSidewallText } from '../../sidewallTextFilter';

const now = new Date('2026-11-13');
const L = (text: string, i = 0) => ({ text, frame: { x: 0, y: i * 20, width: 100, height: 18 } });

describe('paddedCropRect', () => {
  test('adds 12 % of the box on each side, in whole pixels, clamped to the frame', () => {
    expect(paddedCropRect({ x: 100, y: 200, width: 100, height: 50 }, { width: 1080, height: 1120 })).toEqual({
      x1: 88,
      y1: 194,
      x2: 212,
      y2: 256,
    });
    expect(paddedCropRect({ x: 2, y: 1100, width: 100, height: 50 }, { width: 1080, height: 1120 })).toEqual({
      x1: 0,
      y1: 1094,
      x2: 114,
      y2: 1120,
    });
  });

  test('a box with nothing left gives null', () => {
    expect(paddedCropRect({ x: 1079.5, y: 0, width: 0.2, height: 10 }, { width: 1080, height: 1120 })).toBeNull();
  });

  test('orientations are 0°, 90° CW, 90° CCW, 180°', () => {
    expect(CROP_ROTATIONS).toEqual([0, 90, -90, 180]);
  });
});

describe('scoreCropRead and bestCropRead', () => {
  const score = (label: string, texts: string[]) => {
    const lines = texts.map((t, i) => L(t, i));
    return scoreCropRead(label, lines, filterSidewallText(lines, now), now);
  };

  test('the class’s own field parsed scores 3, a partial sign 2, other text 1, nothing 0', () => {
    expect(score('Size', ['215/60 R17 96H'])).toBeCloseTo(3.11, 2);
    expect(score('Size', ['13/60 R17 96H,ELDl/'])).toBeCloseTo(2.14, 2); // partial: /60 R17 96H
    expect(score('Size', ['hello'])).toBeCloseTo(1.05, 2);
    expect(score('Size', ['---'])).toBe(0);
    expect(score('DOT', ['DOT 4B9X 1F2 2119'])).toBeGreaterThanOrEqual(3);
    expect(score('DOT', ['DOT'])).toBeCloseTo(2.03, 2);
    expect(score('Brand', ['CONTINENTAL'])).toBeGreaterThanOrEqual(3);
    expect(score('Brand', ['tinentals'])).toBeGreaterThanOrEqual(3); // brand root
    expect(score('Model', ['ComfortContact'])).toBeGreaterThanOrEqual(3);
    expect(score('Model', ['CC7'])).toBeCloseTo(2.03, 2); // listed code alone
  });

  test('the orientation whose text fits the class wins; ties go to the earlier orientation', () => {
    const reads = [
      cropRead('Size', 0, [L('ILl 1')], now),
      cropRead('Size', 90, [L('215/60 R17 96H')], now),
      cropRead('Size', -90, [L('H96 71R 06/512')], now),
      cropRead('Size', 180, [L('215/60 R17 96H')], now),
    ];
    const best = bestCropRead(reads)!;
    expect(best.rotation).toBe(90);
    expect(best.reading.size).toBe('215/60 R17');
    expect(best.text).toBe('215/60 R17 96H');
    expect(bestCropRead([])).toBeNull();
  });

  test('a Brand crop that only reads a size scores like other text (1), so a Size-shaped read never claims Brand', () => {
    expect(score('Brand', ['215/60 R17'])).toBeCloseTo(1.08, 2);
  });
});
