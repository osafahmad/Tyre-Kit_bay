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

const ROOT = `${__dirname}/../../..`;
const MODEL_PATH = `${ROOT}/assets/models/tyre_detector.tflite`;
const entry = modelManifest.sidewallTextDetector!;
const file = readTfliteFile(readFile(MODEL_PATH));

/** A loaded model that reports the real file's tensors, as fast-tflite would. */
const realTensorsModel = (): InferenceModel => ({
  inputs: file.inputs,
  outputs: file.outputs,
  run: jest.fn(),
});

describe('shipped manifest: sidewallTextDetector (tyre_detector.tflite)', () => {
  test('is registered with the values from the model file', () => {
    expect(entry).toEqual(
      expect.objectContaining({
        inputShape: [1, 3, 224, 224],
        inputLayout: 'NCHW',
        inputType: 'float32',
        colorOrder: 'RGB',
        resize: 'letterbox',
        letterboxPadValue: 114,
        normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
        inputQuantization: null,
        labels: ['Brand', 'Dot-Code', 'Model', 'Size'],
        confidenceThreshold: 0.25,
        outputFormat: 'yolov8_raw',
        outputType: 'float32',
        outputQuantization: null,
        outputShape: [1, 8, 1029],
        boxFormat: 'cxcywh_normalised',
        iouThreshold: 0.45,
        maxDetections: 300,
      }),
    );
    expect(typeof entry.file).toBe('number');
  });

  test('the entry is valid', () => {
    expect(validateManifestEntry('sidewallTextDetector', entry)).toEqual([]);
  });

  test('matches the tensors and metadata inside the bundled .tflite file', () => {
    expect(file.inputs).toEqual([
      expect.objectContaining({ shape: entry.inputShape, dataType: entry.inputType, quantized: false }),
    ]);
    expect(file.outputs).toEqual([
      expect.objectContaining({ shape: entry.outputShape, dataType: entry.outputType, quantized: false }),
    ]);
    const meta = file.ultralytics!;
    expect(meta.task).toBe('detect');
    expect(meta.imgsz).toEqual([entry.inputShape[2], entry.inputShape[3]]);
    expect(Object.values(meta.names as Record<string, string>)).toEqual(entry.labels);
    expect(checkModelMatchesManifest('sidewallTextDetector', realTensorsModel(), entry)).toEqual([]);
  });

  test('the loader opens it without failures (iOS bundle path)', async () => {
    const deps = fakeLoaderDeps({
      resolveAssetUri: f => (f === entry.file ? 'file:///bundle/tyre_detector.tflite' : null),
      createModel: jest.fn(async () => realTensorsModel()),
    });
    const r = await loadModel('sidewallTextDetector', modelManifest, deps);
    expect(r.ok).toBe(true);
    expect(deps.createModel).toHaveBeenCalledWith('file:///bundle/tyre_detector.tflite', []);
  });

  test('the loader opens it without failures (Android raw resource, copied to cache)', async () => {
    const deps = fakeLoaderDeps({
      platform: 'android',
      resolveAssetUri: () => 'assets_models_tyre_detector',
      createModel: jest.fn(async () => realTensorsModel()),
    });
    const r = await loadModel('sidewallTextDetector', modelManifest, deps);
    expect(r.ok).toBe(true);
    expect(deps.copyResource).toHaveBeenCalledWith(
      'assets_models_tyre_detector.tflite',
      '/caches/models/assets_models_tyre_detector.tflite',
    );
  });

  test('the loader rejects the export notes’ NHWC/int8 description of this file', async () => {
    const wrong = { ...entry, inputShape: [1, 224, 224, 3], inputLayout: 'NHWC' as const };
    const deps = fakeLoaderDeps({
      resolveAssetUri: () => 'file:///bundle/tyre_detector.tflite',
      createModel: jest.fn(async () => realTensorsModel()),
    });
    const r = await loadModel('sidewallTextDetector', { ...modelManifest, sidewallTextDetector: wrong }, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.reason).toBe('manifest_mismatch');
    expect(
      validateManifestEntry('sidewallTextDetector', { ...entry, inputType: 'int8' }),
    ).toContain('inputQuantization is required for int8 input');
  });

  test('detector output shape must fit the labels', () => {
    expect(
      validateManifestEntry('sidewallTextDetector', { ...entry, outputShape: [1, 7, 1029] }),
    ).toContain('outputShape needs 4 box values + 4 label scores, has 7');
  });
});

const TREAD_PATH = `${ROOT}/assets/models/tread_wear.tflite`;
const treadWear = modelManifest.treadWear!;
const treadFile = readTfliteFile(readFile(TREAD_PATH));

describe('shipped manifest: treadWear (tread_wear.tflite)', () => {
  const treadModel = (): InferenceModel => ({ inputs: treadFile.inputs, outputs: treadFile.outputs, run: jest.fn() });

  test('is registered with the values from the model file', () => {
    expect(treadWear).toEqual(
      expect.objectContaining({
        inputShape: [1, 3, 224, 224],
        inputLayout: 'NCHW',
        inputType: 'float32',
        colorOrder: 'RGB',
        resize: 'letterbox',
        letterboxPadValue: 114,
        normalisation: { mean: [0, 0, 0], std: [255, 255, 255] },
        inputQuantization: null,
        confidenceThreshold: 0.25,
        outputFormat: 'yolov8_raw',
        outputType: 'float32',
        outputQuantization: null,
        outputShape: [1, 18, 1029],
        boxFormat: 'cxcywh_normalised',
        iouThreshold: 0.45,
        maxDetections: 300,
      }),
    );
    expect(treadWear.labels).toEqual([...TREAD_WEAR_CLASSES]);
    expect(validateManifestEntry('treadWear', treadWear)).toEqual([]);
  });

  test('matches the tensors and metadata inside the bundled .tflite file', () => {
    expect(treadFile.inputs).toEqual([
      expect.objectContaining({ shape: treadWear.inputShape, dataType: 'float32', quantized: false }),
    ]);
    expect(treadFile.outputs).toEqual([
      expect.objectContaining({ shape: treadWear.outputShape, dataType: 'float32', quantized: false }),
    ]);
    const meta = treadFile.ultralytics!;
    expect(meta.task).toBe('detect');
    expect(meta.end2end).toBe(false);
    expect(meta.imgsz).toEqual([224, 224]);
    expect(Object.values(meta.names as Record<string, string>)).toEqual(treadWear.labels);
    expect(checkModelMatchesManifest('treadWear', treadModel(), treadWear)).toEqual([]);
  });

  test('the loader opens it, trying the hardware delegate before CPU', async () => {
    const createModel = jest
      .fn()
      .mockRejectedValueOnce(new Error('no GPU'))
      .mockResolvedValueOnce(treadModel());
    const deps = fakeLoaderDeps({
      resolveAssetUri: f => (f === treadWear.file ? 'file:///bundle/tread_wear.tflite' : null),
      createModel,
      acceleration: ['core-ml'],
    });
    const r = await loadModel('treadWear', modelManifest, deps);
    expect(r.ok && r.model.delegate).toBe('cpu');
    expect(createModel.mock.calls).toEqual([
      ['file:///bundle/tread_wear.tflite', ['core-ml']],
      ['file:///bundle/tread_wear.tflite', []],
    ]);
  });

  test('the loader rejects an entry whose output shape does not fit 14 classes', () => {
    expect(validateManifestEntry('treadWear', { ...treadWear, outputShape: [1, 8, 1029] })).toContain(
      'outputShape needs 4 box values + 14 label scores, has 8',
    );
  });

  test('config: 224 × 224 × 3 NCHW, Core ML / GPU then CPU, no NNAPI', () => {
    expect(TREAD_MODEL_CONFIG).toEqual({
      inputWidth: 224,
      inputHeight: 224,
      channels: 3,
      layout: 'NCHW',
      delegates: { ios: ['core-ml'], android: ['android-gpu'], fallback: 'cpu' },
      confidenceThreshold: 0.25,
      iouThreshold: 0.45,
      maxDetections: 300,
    });
  });
});

describe('rest of the shipped manifest', () => {
  test('tyre detector, tread and damage are still missing; analysis stays pending', () => {
    expect(missingModels()).toEqual(['tyreDetector', 'tread', 'damage']);
    expect(hasAnalysisModels()).toBe(false);
  });

  test('the sidewall text detector does not switch on the tyre detector', () => {
    expect(isTyreDetectorAvailable()).toBe(false);
  });
});
