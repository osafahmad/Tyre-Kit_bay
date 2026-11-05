import { generatePDF } from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import { unlink } from '@dr.pogodin/react-native-fs';
import type { Inspection } from '../inspection/types';
import { reportFileName, reportHtml } from './reportHtml';

/**
 * Builds the report PDF on the phone and opens the system share sheet.
 * Sharing is the only way inspection data leaves the app (spec §8), and only
 * when the user picks a destination.
 *
 * The PDF goes to the app's temporary folder (no `directory` option): iOS
 * `NSTemporaryDirectory()`, Android `cacheDir`, which react-native-share's
 * FileProvider can hand to other apps. The previous PDF is deleted when the
 * next one is made, not straight after sharing, because the receiving app may
 * still be reading it.
 */
let lastPdfPath: string | null = null;

export type ShareOutcome = 'shared' | 'dismissed';

export async function shareReport(
  inspection: Inspection,
  options: { demo: boolean },
): Promise<ShareOutcome> {
  if (lastPdfPath) {
    const old = lastPdfPath;
    lastPdfPath = null;
    await unlink(old).catch(() => {});
  }
  const fileName = reportFileName(inspection);
  const { filePath } = await generatePDF({
    html: reportHtml(inspection, options),
    fileName,
  });
  lastPdfPath = filePath;
  const result = await Share.open({
    url: filePath.startsWith('file://') ? filePath : `file://${filePath}`,
    type: 'application/pdf',
    filename: fileName,
    title: 'Tyre report',
    failOnCancel: false,
  });
  return result.dismissedAction || result.success === false ? 'dismissed' : 'shared';
}

/** Used by tests. */
export function resetShareState() {
  lastPdfPath = null;
}
