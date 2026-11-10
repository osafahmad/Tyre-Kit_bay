import { NativeModules } from 'react-native';
import type { OcrResult } from 'rn-mlkit-ocr';
import type { OcrLineLike } from './textCandidates';

/**
 * On-device text recognition (Google ML Kit, Latin, bundled models). Works
 * only on local files; nothing is sent anywhere.
 *
 * Unavailable when the native module isn't in the build (iOS simulator builds
 * made with TYREKITBAY_IOS_SIM=1). Screens then fall back to typing.
 */
export function isOcrAvailable(): boolean {
  return NativeModules.RnMlkitOcr != null;
}

export async function recognizeLines(filePath: string): Promise<OcrLineLike[]> {
  if (!isOcrAvailable()) throw new Error('OCR is not available in this build.');
  // Required lazily so a build without the module doesn't fail at import.
  const { recognizeText } = require('rn-mlkit-ocr') as typeof import('rn-mlkit-ocr');
  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  return ocrResultLines(await recognizeText(uri, 'latin'));
}

/** Every line of every ML Kit text block, with its frame (pixels of the image read). */
export function ocrResultLines(result: OcrResult): OcrLineLike[] {
  return result.blocks.flatMap(block => block.lines);
}
