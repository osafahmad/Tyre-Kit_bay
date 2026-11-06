import { absoluteFramePath } from '../../features/capture/frameFiles';
import { defaultModelLoaderDeps, loadModel, type ModelLoaderDeps } from '../inference/modelLoader';
import { localFramePath, type PipelineDeps } from '../inference/pipeline';
import {
  detectionToFrameRect,
  imageFileToModelInput,
  tensorSpecFromManifest,
  type ImageDecoder,
} from '../inference/tensorUtils';
import type { LoadedModel, ModelDelegate, PixelRect } from '../inference/types';
import { modelManifest, type ModelManifest, type YoloDetectorManifestEntry } from '../manifest';
import { parseTreadWearOutput, type TreadWearDetection } from '../utils/treadWearPostProcess';
import { treadLog } from './treadDebug';

// Runs the tread wear model on saved tread frames, after capture only (spec
// §4.15: heavy tread models never run during preview). Screens don't use this
// directly; they go through `useTyreInspection`.

export type TreadWearFrameDetection = TreadWearDetection & {
  /** The box in the saved frame's pixels (letterbox undone), or null if it was all padding. */
  frameRect: PixelRect | null;
};

export type TreadWearFrameResult = { frame: string; detections: TreadWearFrameDetection[] };

export type TreadWearUnavailableReason = 'model_missing' | 'no_frames' | 'unreadable';

export type TreadWearScanOutcome =
  /**
   * `no_frames`: no saved tread frames (or only simulated ones).
   * `unreadable`: there were frames, but none could be read or run, so
   * nothing was checked. Never reported as "no wear found".
   */
  | { status: 'unavailable'; reason: TreadWearUnavailableReason }
  | { status: 'cancelled' }
  | {
      status: 'done';
      frames: TreadWearFrameResult[];
      /** Frames that couldn't be decoded or run; they're skipped, not guessed. */
      framesFailed: number;
      delegate: ModelDelegate | 'cpu';
      /** Manifest version of the model that ran. */
      modelVersion: string;
    };

export type TreadWearDetectorDeps = {
  /** The model, or null if it isn't in the build or won't open. */
  loadModel(): Promise<LoadedModel<YoloDetectorManifestEntry> | null>;
  pipeline: PipelineDeps;
};

export interface TreadWearScanner {
  scan(frames: string[], isCancelled?: () => boolean): Promise<TreadWearScanOutcome>;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** `demo://` frames come from the development capture simulation: there's no image to read. */
const isRealFrame = (f: string) => !f.startsWith('demo://');

export class TreadWearDetector implements TreadWearScanner {
  private model: Promise<LoadedModel<YoloDetectorManifestEntry> | null> | null = null;

  constructor(private readonly deps: TreadWearDetectorDeps) {}

  /** Loads the model once. A failed load is retried on the next call. */
  async load(): Promise<LoadedModel<YoloDetectorManifestEntry> | null> {
    this.model ??= this.deps.loadModel().catch(e => {
      treadLog('model load threw', { error: errorText(e) });
      return null;
    });
    const loaded = await this.model;
    if (!loaded) this.model = null;
    treadLog(loaded ? `model loaded (delegate ${loaded.delegate})` : 'model NOT loaded');
    return loaded;
  }

  /** One saved frame → wear detections. Throws if the frame can't be read or the model fails. */
  async detectFrame(
    loaded: LoadedModel<YoloDetectorManifestEntry>,
    frame: string,
  ): Promise<TreadWearFrameResult> {
    const spec = tensorSpecFromManifest(loaded.entry);
    // Resize, letterbox (grey 114), RGB / 255, planar NCHW float32; every image is disposed.
    const input = await imageFileToModelInput(
      localFramePath(frame, this.deps.pipeline),
      spec,
      this.deps.pipeline.decoder,
    );
    const [output] = await loaded.model.run([input.tensor]);
    if (!output) throw new Error('The tread wear model returned nothing.');
    const lb = input.letterbox;
    const detections = parseTreadWearOutput(output, loaded.entry).map(d => ({
      ...d,
      frameRect: lb
        ? detectionToFrameRect(
            {
              label: d.label,
              labelIndex: -1,
              score: d.confidence,
              x1: d.bbox[0] * spec.width,
              y1: d.bbox[1] * spec.height,
              x2: (d.bbox[0] + d.bbox[2]) * spec.width,
              y2: (d.bbox[1] + d.bbox[3]) * spec.height,
            },
            lb,
          )
        : null,
    }));
    return { frame, detections };
  }

  /**
   * Every saved tread frame, one at a time. Never throws: a missing model or
   * no readable frames is reported as `unavailable`, and a frame that fails
   * is skipped and counted.
   */
  async scan(frames: string[], isCancelled: () => boolean = () => false): Promise<TreadWearScanOutcome> {
    const real = frames.filter(isRealFrame);
    if (real.length === 0) return { status: 'unavailable', reason: 'no_frames' };
    const loaded = await this.load();
    if (!loaded) return { status: 'unavailable', reason: 'model_missing' };

    const results: TreadWearFrameResult[] = [];
    let failed = 0;
    for (let i = 0; i < real.length; i++) {
      if (isCancelled()) return { status: 'cancelled' };
      try {
        const r = await this.detectFrame(loaded, real[i]);
        results.push(r);
        treadLog(`frame ${i + 1}/${real.length}: ${r.detections.length} detections`, {
          top: r.detections.slice(0, 3).map(d => [d.label, Number(d.confidence.toFixed(3))]),
        });
      } catch (e) {
        failed++;
        treadLog(`frame ${i + 1}/${real.length} failed`, { error: errorText(e) });
      }
    }
    if (isCancelled()) return { status: 'cancelled' };
    if (results.length === 0) {
      treadLog('scan read no frames', { framesFailed: failed });
      return { status: 'unavailable', reason: 'unreadable' };
    }
    treadLog('scan done', { framesRead: results.length, framesFailed: failed, delegate: loaded.delegate });
    return {
      status: 'done',
      frames: results,
      framesFailed: failed,
      delegate: loaded.delegate,
      modelVersion: loaded.entry.version,
    };
  }
}

function nitroDecoder(): ImageDecoder {
  // Loaded lazily so tests and builds without the module don't touch native code.
  const { Images } = require('react-native-nitro-image') as typeof import('react-native-nitro-image');
  return Images as unknown as ImageDecoder;
}

export function defaultTreadWearDetectorDeps(
  manifest: ModelManifest = modelManifest,
  loaderDeps: () => ModelLoaderDeps = defaultModelLoaderDeps,
): TreadWearDetectorDeps {
  return {
    // Core ML (iOS) / GPU (Android), then CPU: the shared loader's order.
    loadModel: async () => {
      const r = await loadModel('treadWear', manifest, loaderDeps());
      if (!r.ok) treadLog('model load failed', r.failure);
      return r.ok ? r.model : null;
    },
    pipeline: {
      resolveFramePath: absoluteFramePath,
      get decoder(): ImageDecoder {
        return nitroDecoder();
      },
    },
  };
}

let instance: TreadWearDetector | null = null;

/** One detector for the app, so the model is loaded once. */
export function getTreadWearDetector(): TreadWearDetector {
  instance ??= new TreadWearDetector(defaultTreadWearDetectorDeps());
  return instance;
}
