import {
  bestCropRead,
  cropMarginForFrame,
  cropRead,
  paddedCropRect,
  scoreCropRead,
  CROP_PADDING_INPUT_PX,
  CROP_ROTATIONS,
} from '../sidewallCropOcr';
import { filterSidewallText } from '../../sidewallTextFilter';

const now = new Date('2026-11-13');
const L = (text: string, i = 0) => ({ text, frame: { x: 0, y: i * 20, width: 100, height: 18 } });

describe('paddedCropRect', () => {
  test('adds the same pixel margin on each side of the axis-aligned box, in whole pixels, clamped to the frame', () => {
    expect(paddedCropRect({ x: 100.4, y: 200.6, width: 100, height: 50 }, { width: 1080, height: 1120 }, 14)).toEqual({
      x1: 86,
      y1: 186,
      x2: 215,
      y2: 265,
    });
    expect(paddedCropRect({ x: 2, y: 1100, width: 100, height: 50 }, { width: 1080, height: 1120 }, 14)).toEqual({
      x1: 0,
      y1: 1086,
      x2: 116,
      y2: 1120,
    });
    // Default: the margin in input pixels, used as it is.
    expect(paddedCropRect({ x: 100, y: 200, width: 100, height: 50 }, { width: 1080, height: 1120 })).toEqual({
      x1: 92,
      y1: 192,
      x2: 208,
      y2: 258,
    });
  });

  test('the margin is 8 detector-input pixels (within the 5–10 px asked for), scaled to the saved frame', () => {
    expect(CROP_PADDING_INPUT_PX).toBe(8);
    expect(CROP_PADDING_INPUT_PX).toBeGreaterThanOrEqual(5);
    expect(CROP_PADDING_INPUT_PX).toBeLessThanOrEqual(10);
    expect(cropMarginForFrame(0.5)).toBe(16);
    expect(cropMarginForFrame(640 / 1120)).toBeCloseTo(14, 5);
    expect(cropMarginForFrame(2)).toBe(4);
    // No letterbox scale: the margin as it is.
    expect(cropMarginForFrame(null)).toBe(8);
    expect(cropMarginForFrame(0)).toBe(8);
  });

  test('a box under a pixel wide or high, or outside the frame, gives null: the margin alone is never cropped', () => {
    expect(paddedCropRect({ x: 1079.5, y: 0, width: 0.2, height: 10 }, { width: 1080, height: 1120 })).toBeNull();
    expect(paddedCropRect({ x: 100, y: 100, width: 50, height: 0.5 }, { width: 1080, height: 1120 }, 14)).toBeNull();
    expect(paddedCropRect({ x: 1085, y: 100, width: 50, height: 20 }, { width: 1080, height: 1120 }, 14)).toBeNull();
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
