import {
  argmax,
  centerCropRect,
  classifierProbabilities,
  imageFileToTensor,
  meanVectors,
  pixelLayout,
  pixelsToTensor,
  quantize,
  readScores,
  softmax,
  tensorSpecFromManifest,
} from '../tensorUtils';
import type { RawPixels, TensorSpec } from '../types';
import { fakeDecoder, treadEntry } from '../__fixtures__/models';

const spec = (over: Partial<TensorSpec> = {}): TensorSpec => ({
  width: 2,
  height: 1,
  layout: 'NHWC',
  dtype: 'float32',
  colorOrder: 'RGB',
  resize: 'stretch',
  normalisation: null,
  quantization: null,
  padValue: 0,
  ...over,
});

/** 2x1 RGBA: red pixel then blue pixel. */
const twoPixels = (): RawPixels => ({
  buffer: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]).buffer,
  width: 2,
  height: 1,
  pixelFormat: 'RGBA',
});

describe('tensorSpecFromManifest', () => {
  test('reads width and height for NHWC and NCHW', () => {
    expect(tensorSpecFromManifest({ ...treadEntry, inputShape: [1, 10, 20, 3] })).toMatchObject({
      height: 10,
      width: 20,
    });
    expect(
      tensorSpecFromManifest({ ...treadEntry, inputLayout: 'NCHW', inputShape: [1, 3, 10, 20] }),
    ).toMatchObject({ height: 10, width: 20, layout: 'NCHW' });
  });
});

describe('pixelLayout', () => {
  test('knows the channel offsets of each format', () => {
    expect(pixelLayout('BGRA')).toEqual({ r: 2, g: 1, b: 0, bytesPerPixel: 4 });
    expect(pixelLayout('ARGB')).toEqual({ r: 1, g: 2, b: 3, bytesPerPixel: 4 });
    expect(pixelLayout('RGB')).toEqual({ r: 0, g: 1, b: 2, bytesPerPixel: 3 });
    expect(pixelLayout('unknown')).toBeNull();
  });
});

describe('pixelsToTensor', () => {
  test('raw float32 NHWC keeps 0–255 values in RGB order', () => {
    const out = new Float32Array(pixelsToTensor(twoPixels(), spec()));
    expect(Array.from(out)).toEqual([255, 0, 0, 0, 0, 255]);
  });

  test('applies per-channel normalisation', () => {
    const s = spec({ normalisation: { mean: [255, 0, 0], std: [1, 255, 255] } });
    const out = new Float32Array(pixelsToTensor(twoPixels(), s));
    expect(Array.from(out)).toEqual([0, 0, 0, -255, 0, 1]);
  });

  test('BGR colour order and BGRA input', () => {
    const bgra: RawPixels = { ...twoPixels(), pixelFormat: 'BGRA' };
    // Bytes [255,0,0] read as BGRA mean blue=255; BGR output puts blue first.
    const out = new Float32Array(pixelsToTensor(bgra, spec({ colorOrder: 'BGR' })));
    expect(Array.from(out)).toEqual([255, 0, 0, 0, 0, 255]);
  });

  test('NCHW puts each channel in its own plane', () => {
    const out = new Float32Array(pixelsToTensor(twoPixels(), spec({ layout: 'NCHW' })));
    expect(Array.from(out)).toEqual([255, 0, 0, 0, 0, 255]); // R plane, G plane, B plane
    const distinct: RawPixels = { ...twoPixels(), buffer: new Uint8Array([10, 20, 30, 0, 40, 50, 60, 0]).buffer };
    expect(Array.from(new Float32Array(pixelsToTensor(distinct, spec({ layout: 'NCHW' }))))).toEqual([
      10, 40, 20, 50, 30, 60,
    ]);
  });

  test('quantizes and clamps uint8 and int8 inputs', () => {
    const u8 = new Uint8Array(
      pixelsToTensor(twoPixels(), spec({ dtype: 'uint8', quantization: { scale: 0.5, zeroPoint: 0 } })),
    );
    expect(Array.from(u8)).toEqual([255, 0, 0, 0, 0, 255]); // 510 clamped to 255
    const i8 = new Int8Array(
      pixelsToTensor(
        twoPixels(),
        spec({
          dtype: 'int8',
          normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
          quantization: { scale: 1 / 255, zeroPoint: -128 },
        }),
      ),
    );
    expect(Array.from(i8)).toEqual([127, -128, -128, -128, -128, 127]);
    expect(quantize(-5, 'uint8', { scale: 1, zeroPoint: 0 })).toBe(0);
  });

  test('handles padded rows', () => {
    // 1x2 RGB with 2 padding bytes per row.
    const padded: RawPixels = {
      buffer: new Uint8Array([1, 2, 3, 9, 9, 4, 5, 6, 9, 9]).buffer,
      width: 1,
      height: 2,
      pixelFormat: 'RGB',
    };
    const out = new Float32Array(pixelsToTensor(padded, spec({ width: 1, height: 2 })));
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('rejects wrong size, unknown format, and quantized input without values', () => {
    expect(() => pixelsToTensor(twoPixels(), spec({ width: 3 }))).toThrow(/needs 3x1/);
    expect(() => pixelsToTensor({ ...twoPixels(), pixelFormat: 'unknown' }, spec())).toThrow(
      /Unsupported pixel format/,
    );
    expect(() => pixelsToTensor(twoPixels(), spec({ dtype: 'uint8' }))).toThrow(/quantization/);
  });
});

describe('centerCropRect', () => {
  test('crops the long side to the target aspect', () => {
    expect(centerCropRect(200, 100, 224, 224)).toEqual({ x: 50, y: 0, width: 100, height: 100 });
    expect(centerCropRect(100, 300, 1, 1)).toEqual({ x: 0, y: 100, width: 100, height: 100 });
    expect(centerCropRect(100, 100, 1, 1)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe('imageFileToTensor', () => {
  test('stretch: resizes to the input size and disposes every image', async () => {
    const { decoder, created } = fakeDecoder({ width: 8, height: 6 });
    const buf = await imageFileToTensor('/docs/f.jpg', spec({ width: 4, height: 4 }), decoder);
    expect(decoder.loadFromFileAsync).toHaveBeenCalledWith('/docs/f.jpg');
    expect(new Float32Array(buf)).toHaveLength(4 * 4 * 3);
    expect(created).toHaveLength(2);
    expect(created[0].resizeAsync).toHaveBeenCalledWith(4, 4);
    for (const img of created) expect(img.dispose).toHaveBeenCalledTimes(1);
  });

  test('center_crop: crops before resizing', async () => {
    const { decoder, created } = fakeDecoder({ width: 8, height: 6 });
    await imageFileToTensor('/f.jpg', spec({ width: 4, height: 4, resize: 'center_crop' }), decoder);
    expect(created[0].cropAsync).toHaveBeenCalledWith(1, 0, 7, 6);
    expect(created[1].resizeAsync).toHaveBeenCalledWith(4, 4);
    expect(created).toHaveLength(3);
    for (const img of created) expect(img.dispose).toHaveBeenCalled();
  });

  test('disposes images when decoding fails part way', async () => {
    const { decoder, created } = fakeDecoder({ width: 8, height: 6 });
    const original = decoder.loadFromFileAsync.getMockImplementation()!;
    decoder.loadFromFileAsync.mockImplementationOnce(async (p: string) => {
      const img = await original(p);
      (img.resizeAsync as jest.Mock).mockRejectedValueOnce(new Error('out of memory'));
      return img;
    });
    await expect(imageFileToTensor('/f.jpg', spec({ width: 4, height: 4 }), decoder)).rejects.toThrow(
      'out of memory',
    );
    expect(created).toHaveLength(1);
    expect(created[0].dispose).toHaveBeenCalledTimes(1);
  });
});

describe('scores', () => {
  test('readScores dequantizes uint8 and int8 outputs', () => {
    const u8 = readScores(new Uint8Array([0, 128, 255]).buffer, 'uint8', { scale: 1 / 255, zeroPoint: 0 });
    expect(Array.from(u8).map(v => +v.toFixed(3))).toEqual([0, 0.502, 1]);
    const i8 = readScores(new Int8Array([-128, 127]).buffer, 'int8', { scale: 1 / 256, zeroPoint: -128 });
    expect(Array.from(i8).map(v => +v.toFixed(3))).toEqual([0, 0.996]);
    expect(() => readScores(new Uint8Array([1]).buffer, 'uint8', null)).toThrow(/quantization/);
  });

  test('softmax, argmax and meanVectors', () => {
    const p = softmax(new Float32Array([1, 1, 1]));
    expect(Array.from(p).map(v => +v.toFixed(4))).toEqual([0.3333, 0.3333, 0.3333]);
    expect(argmax(new Float32Array([0.1, 0.7, 0.2]))).toBe(1);
    expect(Array.from(meanVectors([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([
      0.5, 0.5,
    ]);
    expect(() => meanVectors([])).toThrow();
    expect(() => meanVectors([new Float32Array(2), new Float32Array(3)])).toThrow();
  });

  test('classifierProbabilities applies softmax to logits and checks label count', () => {
    const logits = { ...treadEntry, scores: 'logits' as const };
    const p = classifierProbabilities(new Float32Array([0, 0, 0]).buffer, logits);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(() => classifierProbabilities(new Float32Array([1, 0]).buffer, treadEntry)).toThrow(
      /2 scores for 3 labels/,
    );
  });
});
