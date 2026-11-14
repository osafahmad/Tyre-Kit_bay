import { hasAnalysisModels, missingModels, modelManifest } from '../manifest';
import { isTyreDetectorAvailable } from '../tyreDetector';
import { TREAD_MODEL_CONFIG, TREAD_WEAR_CLASSES } from '../config/treadWearConfig';
import {
  checkModelMatchesManifest,
  loadModel,
  validateManifestEntry,
} from '../inference/modelLoader';
import { fakeLoaderDeps } from '../inference/__fixtures__/models';
import { readFile, readTfliteFile } from '../inference/__fixtures__/tfliteFile';
import type { InferenceModel } from '../inference/types';

declare const __dirname: string; // Jest (Node); the project doesn't load Node's types.

const { readFileSync } = require('fs') as { readFileSync(path: string, encoding: 'utf8'): string };
const { createHash } = require('crypto') as {
  createHash(algorithm: 'sha256'): { update(data: Uint8Array): { digest(encoding: 'hex'): string } };
};
const readText = (path: string) => readFileSync(path, 'utf8');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const ROOT = `${__dirname}/../../..`;
const TREAD_PATH = `${ROOT}/assets/models/tread_wear.tflite`;
const SIDEWALL_PATH = `${ROOT}/assets/models/sidewall_detector.tflite`;
const treadWear = modelManifest.treadWear!;
const treadFile = readTfliteFile(readFile(TREAD_PATH));
const sidewallText = modelManifest.sidewallText!;
const sidewallFile = readTfliteFile(readFile(SIDEWALL_PATH));

describe('shipped manifest: treadWear (tread_wear.tflite, SSDLite)', () => {
  const treadModel = (): InferenceModel => ({ inputs: treadFile.inputs, outputs: treadFile.outputs, run: jest.fn() });

  test('is registered with the values from the model file and the owner', () => {
    expect(treadWear).toEqual(
      expect.objectContaining({
        inputShape: [1, 320, 320, 3],
        inputLayout: 'NHWC',
        inputType: 'float32',
        colorOrder: 'RGB',
        resize: 'stretch',
        normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
        inputQuantization: null,
        backgroundIndex: 0,
        confidenceThreshold: 0.35,
        outputFormat: 'ssd_raw',
        outputType: 'float32',
        outputQuantization: null,
        outputs: {
          boxes: { name: 'raw_boxes', shape: [1, 3234, 4] },
          scores: { name: 'raw_scores', shape: [1, 3234, 16] },
        },
        scores: 'probabilities',
        boxCoder: { weights: [10, 10, 5, 5], bboxXformClip: Math.log(1000 / 16) },
        iouThreshold: 0.45,
        maxDetections: 300,
      }),
    );
    expect(treadWear.anchors).toEqual({
      generator: 'torchvision_default_boxes',
      featureMapSizes: [20, 10, 5, 3, 2, 1],
      aspectRatios: Array.from({ length: 6 }, () => [2, 3]),
      minRatio: 0.2,
      maxRatio: 0.95,
      clip: true,
    });
    expect(treadWear.labels).toEqual(['background', ...TREAD_WEAR_CLASSES]);
    expect(validateManifestEntry('treadWear', treadWear)).toEqual([]);
  });

  test('matches the tensors inside the bundled .tflite file', () => {
    expect(treadFile.inputs).toEqual([
      expect.objectContaining({ name: 'input', shape: treadWear.inputShape, dataType: 'float32', quantized: false }),
    ]);
    expect(treadFile.outputs).toEqual([
      expect.objectContaining({ ...treadWear.outputs.boxes, dataType: 'float32', quantized: false }),
      expect.objectContaining({ ...treadWear.outputs.scores, dataType: 'float32', quantized: false }),
    ]);
    expect(treadFile.ultralytics).toBeNull(); // no longer an Ultralytics export
    expect(checkModelMatchesManifest('treadWear', treadModel(), treadWear)).toEqual([]);
  });

  test('iOS: the loader opens it on CPU straight away, never trying Core ML', async () => {
    const createModel = jest.fn().mockResolvedValue(treadModel());
    const deps = fakeLoaderDeps({
      platform: 'ios',
      resolveAssetUri: f => (f === treadWear.file ? 'file:///bundle/tread_wear.tflite' : null),
      createModel,
      acceleration: ['core-ml'],
    });
    const r = await loadModel('treadWear', modelManifest, deps);
    expect(r.ok && r.model.delegate).toBe('cpu');
    expect(createModel.mock.calls).toEqual([['file:///bundle/tread_wear.tflite', []]]);
  });

  test('Android: the loader tries the GPU delegate before CPU', async () => {
    const createModel = jest
      .fn()
      .mockRejectedValueOnce(new Error('no GPU'))
      .mockResolvedValueOnce(treadModel());
    const deps = fakeLoaderDeps({
      platform: 'android',
      resolveAssetUri: f => (f === treadWear.file ? 'file:///bundle/tread_wear.tflite' : null),
      createModel,
      acceleration: ['android-gpu'],
    });
    const r = await loadModel('treadWear', modelManifest, deps);
    expect(r.ok && r.model.delegate).toBe('cpu');
    expect(createModel.mock.calls).toEqual([
      ['file:///bundle/tread_wear.tflite', ['android-gpu']],
      ['file:///bundle/tread_wear.tflite', []],
    ]);
  });

  test('the loader rejects the export notes’ NCHW description of this file', async () => {
    const nchw = { ...treadWear, inputShape: [1, 3, 320, 320], inputLayout: 'NCHW' as const };
    expect(validateManifestEntry('treadWear', nchw)).toEqual([]);
    const deps = fakeLoaderDeps({
      resolveAssetUri: () => 'file:///bundle/tread_wear.tflite',
      createModel: jest.fn(async () => treadModel()),
    });
    const r = await loadModel('treadWear', { ...modelManifest, treadWear: nchw }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.reason).toBe('manifest_mismatch');
  });

  test('the loader rejects swapped or reshaped outputs', () => {
    const swapped: InferenceModel = { ...treadModel(), outputs: [...treadFile.outputs].reverse() };
    expect(checkModelMatchesManifest('treadWear', swapped, treadWear)).toEqual(
      expect.arrayContaining(['output 0 is raw_scores, manifest says raw_boxes']),
    );
    const one: InferenceModel = { ...treadModel(), outputs: [treadFile.outputs[0]] };
    expect(checkModelMatchesManifest('treadWear', one, treadWear)).toContain('expected 2 output tensors, model has 1');
  });

  test('entry checks: label count, anchor count and box coder', () => {
    const fewer = { ...treadWear, labels: treadWear.labels.slice(0, 15) };
    expect(validateManifestEntry('treadWear', fewer)).toContain('outputs.scores needs 15 label scores, has 16');
    const anchors = { ...treadWear.anchors, featureMapSizes: [19, 10, 5, 3, 2, 1] };
    expect(validateManifestEntry('treadWear', { ...treadWear, anchors })).toContain(
      'anchors config makes 3000 anchors, outputs have 3234',
    );
    const boxCoder = { weights: [10, 10, 5, 0] as [number, number, number, number], bboxXformClip: 4 };
    expect(validateManifestEntry('treadWear', { ...treadWear, boxCoder })).toContain(
      'boxCoder.weights needs 4 positive values',
    );
    expect(validateManifestEntry('treadWear', { ...treadWear, backgroundIndex: 16 })).toContain(
      'backgroundIndex must point at a label',
    );
  });

  test('config: 320 × 320 × 3 NHWC, Core ML / GPU then CPU, no NNAPI', () => {
    expect(TREAD_MODEL_CONFIG).toEqual({
      inputWidth: 320,
      inputHeight: 320,
      channels: 3,
      layout: 'NHWC',
      delegates: { ios: ['core-ml'], android: ['android-gpu'], fallback: 'cpu' },
      confidenceThreshold: 0.35,
      iouThreshold: 0.45,
      maxDetections: 300,
    });
  });
});

describe('shipped manifest: sidewallText (sidewall_detector.tflite, YOLOX-Nano)', () => {
  const sidewallModel = (): InferenceModel => ({
    inputs: sidewallFile.inputs,
    outputs: sidewallFile.outputs,
    run: jest.fn(),
  });

  test('is registered with the values from the model file and the owner’s model card (2026-11-14)', () => {
    expect(sidewallText).toEqual(
      expect.objectContaining({
        version: 'yolox-nano-tyre-to-text-v3-2026-11-14',
        inputShape: [1, 3, 640, 640],
        inputLayout: 'NCHW',
        inputType: 'float32',
        colorOrder: 'RGB',
        resize: 'letterbox',
        letterboxPadValue: 114,
        normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
        inputQuantization: null,
        labels: ['Brand', 'DOT', 'Model', 'Size'],
        confidenceThreshold: 0.25,
        outputFormat: 'yolox_decoded',
        outputType: 'float32',
        outputQuantization: null,
        outputs: {
          detections: { name: 'serving_default_output_0_output', shape: [1, 8, 8400] },
        },
        boxFormat: 'cxcywh_pixels',
        iouThreshold: 0.45,
        maxDetections: 300,
      }),
    );
    expect(sidewallText).not.toHaveProperty('maskCoefficients');
    expect(sidewallText.outputs).not.toHaveProperty('prototypes');
    expect(validateManifestEntry('sidewallText', sidewallText)).toEqual([]);
  });

  test('matches the tensors inside the bundled .tflite file: one [1, 8, 8400] output, no mask prototypes', () => {
    expect(sidewallFile.inputs).toEqual([
      expect.objectContaining({ shape: [1, 3, 640, 640], dataType: 'float32', quantized: false }),
    ]);
    expect(sidewallFile.outputs).toEqual([
      expect.objectContaining({ ...sidewallText.outputs.detections, dataType: 'float32', quantized: false }),
    ]);
    expect(checkModelMatchesManifest('sidewallText', sidewallModel(), sidewallText)).toEqual([]);
  });

  test('the file is the one in the owner’s model card, and is not an Ultralytics (AGPL-3.0) export', () => {
    // The previous YOLO11n-seg file carried Ultralytics metadata with an AGPL-3.0 licence line.
    expect(sidewallFile.ultralytics).toBeNull();
    const card = JSON.parse(readText(`${ROOT}/docs/sidewall_detector.metadata.json`)) as {
      sha256: string;
      ultralytics_used: boolean;
      classes: Record<string, string>;
      input: { shape: number[]; dtype: string; color: string };
      output: { shape: number[]; suggested_postprocess: { score_threshold: number; nms_iou: number } };
    };
    expect(sha256(readFile(SIDEWALL_PATH))).toBe(card.sha256);
    expect(card.ultralytics_used).toBe(false);
    // The manifest values that come from the card, not from the file.
    expect(Object.values(card.classes)).toEqual(sidewallText.labels);
    expect(card.input.shape).toEqual(sidewallText.inputShape);
    expect(card.input.dtype).toBe(sidewallText.inputType);
    expect(card.input.color).toBe(sidewallText.colorOrder);
    expect(card.output.shape).toEqual(sidewallText.outputs.detections.shape);
    expect(card.output.suggested_postprocess).toEqual({
      score_threshold: sidewallText.confidenceThreshold,
      nms_iou: sidewallText.iouThreshold,
    });
  });

  test('the loader rejects the old two-output seg file or an NHWC description of this file', () => {
    const seg: InferenceModel = {
      ...sidewallModel(),
      outputs: [
        { name: 'serving_default_output_0_output', dataType: 'float32', shape: [1, 40, 8400] },
        { name: 'serving_default_output_1_output', dataType: 'float32', shape: [1, 32, 160, 160] },
      ],
    };
    expect(checkModelMatchesManifest('sidewallText', seg, sidewallText)).toEqual(
      expect.arrayContaining([
        'expected 1 output tensor, model has 2',
        'output 0 shape is [1,40,8400], manifest says [1,8,8400]',
      ]),
    );
    const nhwc = { ...sidewallText, inputShape: [1, 640, 640, 3], inputLayout: 'NHWC' as const };
    expect(validateManifestEntry('sidewallText', nhwc)).toEqual([]);
    expect(checkModelMatchesManifest('sidewallText', sidewallModel(), nhwc)).toContain(
      'input shape is [1,3,640,640], manifest says [1,640,640,3]',
    );
  });

  test('the loader opens it with the platform default delegates, then CPU', async () => {
    const createModel = jest
      .fn()
      .mockRejectedValueOnce(new Error('Core ML refused the graph'))
      .mockResolvedValueOnce(sidewallModel());
    const deps = fakeLoaderDeps({
      platform: 'ios',
      resolveAssetUri: f => (f === sidewallText.file ? 'file:///bundle/sidewall_detector.tflite' : null),
      createModel,
      acceleration: ['core-ml'],
    });
    const r = await loadModel('sidewallText', modelManifest, deps);
    expect(r.ok && r.model.delegate).toBe('cpu');
    expect(createModel.mock.calls).toEqual([
      ['file:///bundle/sidewall_detector.tflite', ['core-ml']],
      ['file:///bundle/sidewall_detector.tflite', []],
    ]);
  });
});

describe('rest of the shipped manifest', () => {
  test('tyre detector, tread and damage are still missing; analysis stays pending', () => {
    expect(missingModels()).toEqual(['tyreDetector', 'tread', 'damage']);
    expect(hasAnalysisModels()).toBe(false);
    expect(isTyreDetectorAvailable()).toBe(false);
  });

  test('bundled models are tread_wear.tflite and sidewall_detector.tflite, nothing else', () => {
    const fs = require('fs') as { readdirSync(path: string): string[] };
    expect(fs.readdirSync(`${ROOT}/assets/models`).filter(f => f.endsWith('.tflite')).sort()).toEqual([
      'sidewall_detector.tflite',
      'tread_wear.tflite',
    ]);
    expect(Object.keys(modelManifest)).not.toContain('sidewallTextDetector');
    const bundled = (Object.keys(modelManifest) as (keyof typeof modelManifest)[]).filter(k => modelManifest[k]);
    expect(bundled).toEqual(['treadWear', 'sidewallText']);
  });
});
