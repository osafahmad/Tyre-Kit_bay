import type { YoloSegDetectorManifestEntry } from '../../manifest';
import { imageFileToModelInput, letterboxPlan, padPixels, pixelsToTensor, tensorSpecFromManifest } from '../tensorUtils';
import { decodeYoloSegOutput, detectionToFrameRect } from '../yoloSeg';
import type { DecodableImage, ImageDecoder } from '../tensorUtils';
import type { RawPixels } from '../types';

// Audit (owner request 2026-11-13, iPhone 13 boxes landing on the hub): the
// input must be packed as NCHW planes in RGB order, and `[1, 40, 8400]` must be
// read channel-major (`channel * anchors + anchor`). Every tensor here is
// non-symmetric, so a transposed layout or a swapped channel order changes the
// asserted values.

describe('NCHW input packing', () => {
  // 3 × 2 image, every pixel a different colour, as iOS BGRA with 1 byte of row padding.
  const W = 3;
  const H = 2;
  const px = [
    [10, 20, 30],
    [40, 50, 60],
    [70, 80, 90],
    [100, 110, 120],
    [130, 140, 150],
    [160, 170, 180],
  ]; // RGB per pixel, row-major
  const bgraRowBytes = W * 4 + 1;
  const bgra = new Uint8Array(bgraRowBytes * H);
  px.forEach(([r, g, b], i) => {
    const o = Math.floor(i / W) * bgraRowBytes + (i % W) * 4;
    bgra[o] = b;
    bgra[o + 1] = g;
    bgra[o + 2] = r;
    bgra[o + 3] = 255;
  });
  const spec = {
    width: W,
    height: H,
    layout: 'NCHW' as const,
    dtype: 'float32' as const,
    colorOrder: 'RGB' as const,
    resize: 'letterbox' as const,
    normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
    quantization: null,
    padValue: 114,
  };

  test('BGRA bytes with row padding → R plane, then G plane, then B plane, each row-major', () => {
    const t = new Float32Array(pixelsToTensor({ buffer: bgra.buffer, width: W, height: H, pixelFormat: 'BGRA' }, spec));
    const plane = W * H;
    const values = Array.from(t, v => Math.round(v * 255));
    expect(values.slice(0, plane)).toEqual([10, 40, 70, 100, 130, 160]); // R
    expect(values.slice(plane, 2 * plane)).toEqual([20, 50, 80, 110, 140, 170]); // G
    expect(values.slice(2 * plane)).toEqual([30, 60, 90, 120, 150, 180]); // B
    // Interleaved NHWC would start [10, 20, 30, …]; BGR order would start [30, 60, …].
    expect(values.slice(0, 3)).not.toEqual([10, 20, 30]);
    expect(values[0]).not.toBe(30);
  });

  test('Android RGBA gives the same planes', () => {
    const rgba = new Uint8Array(W * H * 4);
    px.forEach(([r, g, b], i) => rgba.set([r, g, b, 255], i * 4));
    const t = Array.from(new Float32Array(pixelsToTensor({ buffer: rgba.buffer, width: W, height: H, pixelFormat: 'RGBA' }, spec)), v => Math.round(v * 255));
    expect(t.slice(0, 6)).toEqual([10, 40, 70, 100, 130, 160]);
  });

  test('padPixels keeps RGB order and puts the image at padX, padY on the pad grey', () => {
    const out = padPixels({ buffer: bgra.buffer, width: W, height: H, pixelFormat: 'BGRA' }, 5, 4, 1, 1, 114);
    const o = new Uint8Array(out.buffer);
    const at = (x: number, y: number) => Array.from(o.subarray((y * 5 + x) * 3, (y * 5 + x) * 3 + 3));
    expect(at(0, 0)).toEqual([114, 114, 114]);
    expect(at(1, 1)).toEqual([10, 20, 30]); // first pixel, RGB
    expect(at(3, 2)).toEqual([160, 170, 180]); // last pixel
    expect(at(4, 3)).toEqual([114, 114, 114]);
  });
});

// 32 × 32 input, 21 anchors (4² + 2² + 1²), 4 labels, 2 mask coefficients.
const ANCHORS = 21;
const ATTRS = 10;
const entry: YoloSegDetectorManifestEntry = {
  file: 1,
  version: 'test',
  inputShape: [1, 3, 32, 32],
  inputLayout: 'NCHW',
  inputType: 'float32',
  colorOrder: 'RGB',
  resize: 'letterbox',
  letterboxPadValue: 114,
  normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
  inputQuantization: null,
  labels: ['Brand', 'DOT', 'Model', 'Size'],
  confidenceThreshold: 0.25,
  outputFormat: 'yolo_seg_raw',
  outputType: 'float32',
  outputQuantization: null,
  outputs: { detections: { name: 'det', shape: [1, ATTRS, ANCHORS] }, prototypes: { name: 'proto', shape: [1, 2, 8, 8] } },
  maskCoefficients: 2,
  boxFormat: 'cxcywh_normalised',
  iouThreshold: 0.45,
  maxDetections: 300,
};

describe('[1, 40, 8400]-style output stride', () => {
  test('channel-major read: anchor 5 holds cx, cy, w, h at rows 0–3 and its DOT score at row 5', () => {
    const v = new Float32Array(ATTRS * ANCHORS);
    const anchor = 5;
    const channelMajor = (channel: number, a: number) => channel * ANCHORS + a;
    v[channelMajor(0, anchor)] = 0.75; // cx
    v[channelMajor(1, anchor)] = 0.25; // cy
    v[channelMajor(2, anchor)] = 0.5; // w
    v[channelMajor(3, anchor)] = 0.125; // h
    v[channelMajor(5, anchor)] = 0.8; // DOT
    v[channelMajor(9, anchor)] = -0.4; // mask coefficient 1
    const [d] = decodeYoloSegOutput(v.buffer, entry);
    expect(d).toMatchObject({ label: 'DOT', labelIndex: 1 });
    expect(d.score).toBeCloseTo(0.8);
    expect([d.x1, d.y1, d.x2, d.y2]).toEqual([16, 6, 32, 10]);
    expect(Array.from(d.maskCoefficients).map(m => Math.round(m * 10) / 10)).toEqual([0, -0.4]);

    // The same numbers written anchor-major (anchor * 40 + channel) would be
    // decoded as something else entirely: no detection reaches the threshold.
    const t = new Float32Array(ATTRS * ANCHORS);
    const anchorMajor = (channel: number, a: number) => a * ATTRS + channel;
    t[anchorMajor(0, anchor)] = 0.75;
    t[anchorMajor(1, anchor)] = 0.25;
    t[anchorMajor(2, anchor)] = 0.5;
    t[anchorMajor(3, anchor)] = 0.125;
    t[anchorMajor(5, anchor)] = 0.8;
    const wrong = decodeYoloSegOutput(t.buffer, entry);
    expect(wrong.find(x => x.label === 'DOT' && x.x1 === 16)).toBeUndefined();
  });
});

describe('un-letterboxing on the real-car frame size (1080 × 1120 → 640 × 640)', () => {
  test('frame rect = ((coord × 640) − pad) / scale, with the 11 px horizontal pad', () => {
    const plan = letterboxPlan(1080, 1120, 640, 640);
    expect(plan.scale).toBeCloseTo(640 / 1120, 6);
    expect([plan.resizedWidth, plan.resizedHeight, plan.padX, plan.padY]).toEqual([617, 640, 11, 0]);

    // One normalised box: cx 0.6, cy 0.3, w 0.2, h 0.1.
    const v = new Float32Array(ATTRS * ANCHORS);
    v[0 * ANCHORS + 2] = 0.6;
    v[1 * ANCHORS + 2] = 0.3;
    v[2 * ANCHORS + 2] = 0.2;
    v[3 * ANCHORS + 2] = 0.1;
    v[7 * ANCHORS + 2] = 0.9; // Size
    const big = { ...entry, inputShape: [1, 3, 640, 640], outputs: { ...entry.outputs } };
    const [d] = decodeYoloSegOutput(v.buffer, big);
    expect([d.x1, d.y1, d.x2, d.y2].map(n => Math.round(n * 1000) / 1000)).toEqual([320, 160, 448, 224]);
    const rect = detectionToFrameRect(d, { sourceWidth: 1080, sourceHeight: 1120, scale: plan.scale, padX: plan.padX, padY: plan.padY })!;
    const expectX = (c: number) => (c * 640 - 11) / plan.scale;
    const expectY = (c: number) => (c * 640 - 0) / plan.scale;
    expect(rect.x).toBeCloseTo(expectX(0.5), 3);
    expect(rect.y).toBeCloseTo(expectY(0.25), 3);
    expect(rect.width).toBeCloseTo(expectX(0.7) - expectX(0.5), 3);
    expect(rect.height).toBeCloseTo(expectY(0.35) - expectY(0.25), 3);
    expect(Math.round(rect.x)).toBe(541);
    expect(Math.round(rect.y)).toBe(280);
  });

  test('a decoded 1080 × 1120 frame is resized to 617 × 640 and padded 11 px left', async () => {
    // A fake decoder whose pixels encode their x position, so the pad offset is visible in the tensor.
    const make = (width: number, height: number): DecodableImage => ({
      width,
      height,
      cropAsync: async (x0, y0, x1, y1) => make(x1 - x0, y1 - y0),
      resizeAsync: async (w, h) => make(w, h),
      toRawPixelDataAsync: async (): Promise<RawPixels> => {
        const b = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) b.set([x % 256, 7, 9, 255], (y * width + x) * 4);
        return { buffer: b.buffer, width, height, pixelFormat: 'RGBA' };
      },
      dispose: () => {},
    });
    const decoder: ImageDecoder = { loadFromFileAsync: async () => make(1080, 1120) };
    const spec = tensorSpecFromManifest({ ...entry, inputShape: [1, 3, 640, 640] });
    const { tensor, letterbox } = await imageFileToModelInput('/f.jpg', spec, decoder);
    expect(letterbox).toEqual({ sourceWidth: 1080, sourceHeight: 1120, scale: 640 / 1120, padX: 11, padY: 0 });
    const t = new Float32Array(tensor);
    const plane = 640 * 640;
    const r = (x: number, y: number) => Math.round(t[y * 640 + x] * 255);
    const g = (x: number, y: number) => Math.round(t[plane + y * 640 + x] * 255);
    expect(r(10, 0)).toBe(114); // left pad
    expect(r(11, 0)).toBe(0); // first image column
    expect(r(12, 0)).toBe(1);
    expect(g(12, 0)).toBe(7); // G plane holds the green bytes, not the red ones
    expect(r(628, 0)).toBe(114); // right pad (11 + 617 = 628)
  });
});
