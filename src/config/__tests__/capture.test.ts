import { JPEG_QUALITY_PERCENT, captureConfig, ocrConfig } from '../capture';

// nitro-image takes JPEG quality as 0–100. A 0–1 fraction (0.9) silently
// means 0.9 % and wrecks OCR and saved tyre frames.
test.each([
  ['JPEG_QUALITY_PERCENT', JPEG_QUALITY_PERCENT],
  ['captureConfig.jpegQualityPercent', captureConfig.jpegQualityPercent],
  ['ocrConfig.jpegQualityPercent', ocrConfig.jpegQualityPercent],
])('%s is a percent between 50 and 100', (_name, value) => {
  expect(value).toBeGreaterThanOrEqual(50);
  expect(value).toBeLessThanOrEqual(100);
});

test('JPEG quality is 90', () => {
  expect(JPEG_QUALITY_PERCENT).toBe(90);
});
