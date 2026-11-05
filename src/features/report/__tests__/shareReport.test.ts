import { generatePDF } from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import { unlink } from '@dr.pogodin/react-native-fs';
import { resetShareState, shareReport } from '../shareReport';
import { DEMO_DATA_NOTICE } from '../reportHtml';
import type { Inspection } from '../../inspection/types';

const generate = generatePDF as jest.Mock;
const open = Share.open as jest.Mock;
const remove = unlink as jest.Mock;

const inspection: Inspection = {
  id: 'i',
  createdAt: new Date(2026, 10, 4, 11, 40).toISOString(),
  completedAt: null,
  plate: 'ABC-1234',
  chassis: null,
  tyres: [],
  reportPath: null,
  analyzerVersion: 'demo-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  resetShareState();
});

test('makes the PDF on the phone and opens the share sheet with it', async () => {
  await expect(shareReport(inspection, { demo: true })).resolves.toBe('shared');
  expect(generate).toHaveBeenCalledTimes(1);
  const options = generate.mock.calls[0][0];
  expect(options.fileName).toBe('tyre-report-20261104-1140');
  // Temporary folder only: no `directory` (Android would use external storage).
  expect(options.directory).toBeUndefined();
  expect(options.html).toContain('ABC-1234');
  expect(options.html).toContain(DEMO_DATA_NOTICE);
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({
      url: 'file:///tmp/tyre-report-20261104-1140.pdf',
      type: 'application/pdf',
      failOnCancel: false,
    }),
  );
});

test('the previous PDF is deleted when the next one is made', async () => {
  await shareReport(inspection, { demo: false });
  expect(remove).not.toHaveBeenCalled();
  await shareReport(inspection, { demo: false });
  expect(remove).toHaveBeenCalledWith('/tmp/tyre-report-20261104-1140.pdf');
});

test('closing the share sheet is not an error', async () => {
  open.mockResolvedValueOnce({ success: false, dismissedAction: true, message: '' });
  await expect(shareReport(inspection, { demo: false })).resolves.toBe('dismissed');
});

test('PDF failures reach the caller', async () => {
  generate.mockRejectedValueOnce(new Error('no space'));
  await expect(shareReport(inspection, { demo: false })).rejects.toThrow('no space');
  expect(open).not.toHaveBeenCalled();
});
