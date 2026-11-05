import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as VC from 'react-native-vision-camera';
import { generatePDF } from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import App from '../../app/App';
import * as ml from '../../ml';
import { TfliteTyreAnalyzer } from '../../ml/tfliteAnalyzer';
import { useInspectionStore } from '../../features/inspection/store';
import { settings } from '../../features/inspection/settings';
import { MemoryInspectionRepository } from '../../features/inspection/repository';
import { resetShareState } from '../../features/report/shareReport';
import { SHARE_FAILED_MESSAGE } from '../Report/ReportScreen';

let repo: MemoryInspectionRepository;
const camera = (VC as unknown as { __mock: { device: unknown } }).__mock;

beforeEach(() => {
  camera.device = undefined;
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetShareState();
  repo = new MemoryInspectionRepository();
  useInspectionStore.getState().replaceAll([], null);
  settings.setCurrentInspectionId(null);
  settings.setHasSeenWalkthrough(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const press = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));

const tick = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/** Sidewall, tread and Analyse for the tyre on screen (simulated capture, no camera). */
async function captureAndAnalyse() {
  await press('Capture sidewall');
  await press('Scan tread');
  await tick(10_000);
  await press('Analyse tyre');
  await tick(0);
}

async function startTwoTyres(plate: string) {
  await render(<App repository={repo} />);
  await press('Start scan');
  await press('Type it');
  await fireEvent.changeText(await screen.findByLabelText('Number plate, optional'), plate);
  await press('Continue');
  await fireEvent.press(await screen.findByRole('radio', { name: '2' }));
  await press('Scan 2 tyres');
}

describe('release build without tyre models', () => {
  beforeEach(() => {
    // The release analyzer: no models bundled, so it can't produce a result.
    jest.spyOn(ml, 'getAnalyzer').mockReturnValue(new TfliteTyreAnalyzer());
  });

  test('frames are kept, the flow continues, and the report says analysis is pending', async () => {
    await startTwoTyres('lea-12 8197');

    // Front tyre: captured, no models → Analysis pending, not a made-up result.
    expect(await screen.findByText('Front tyre')).toBeTruthy();
    await captureAndAnalyse();
    expect(await screen.findByText('Analysis pending')).toBeTruthy();
    expect(screen.getByText(/Front tyre frames are saved on this phone/)).toBeTruthy();
    expect(screen.queryByText('Demo data')).toBeNull();
    const front = useInspectionStore.getState().inspections[0].tyres[0];
    expect(front.state).toBe('pending_analysis');
    expect(front.result).toBeNull();
    expect(front.treadFrames).toHaveLength(10);

    await press('Next tyre');
    expect(await screen.findByText('1 of 2 tyres scanned')).toBeTruthy();
    expect(screen.getByText('Analysis pending')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    // A pending tyre is enough to finish early.
    expect(screen.getByRole('button', { name: 'Finish and view report' })).toBeTruthy();

    // Rear tyre is next, in order.
    await press('Scan rear tyre');
    expect(await screen.findByText('Rear tyre')).toBeTruthy();
    expect(screen.getByText('Tyre 2 of 2')).toBeTruthy();
    await captureAndAnalyse();
    await press('Next tyre');
    expect(await screen.findByText('2 of 2 tyres scanned')).toBeTruthy();

    await press('View report');
    expect(await screen.findByText('Tyre report')).toBeTruthy();
    expect(screen.getByText(/LEA-12 8197 · /)).toBeTruthy();
    expect(screen.getByText('2 tyres are waiting for analysis.')).toBeTruthy();
    // Headline plus one label per tyre.
    expect(screen.getAllByText('Analysis pending')).toHaveLength(3);
    expect(screen.getAllByText(/18 frames saved/)).toHaveLength(2);
    expect(screen.queryByText(/\d mm/)).toBeNull();
    expect(screen.queryByText('Good')).toBeNull();
    expect(screen.queryByText('Demo data')).toBeNull();

    // Share makes a PDF and opens the share sheet.
    await press('Share report');
    await tick(0);
    expect(generatePDF).toHaveBeenCalledTimes(1);
    const html = (generatePDF as jest.Mock).mock.calls[0][0].html as string;
    expect(html).toContain('LEA-12 8197');
    expect(html).toContain('Analysis pending');
    expect(html).not.toContain('Demo data');
    expect(Share.open).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/pdf' }));

    // Saved, finished, and listed on Home with the pending label.
    await press('Done');
    expect(await screen.findByText('Ready to inspect')).toBeTruthy();
    expect(screen.getByText('LEA-12 8197')).toBeTruthy();
    expect(screen.getByText('Analysis pending')).toBeTruthy();
    await tick(0);
    const [saved] = await repo.loadAll();
    expect(saved.completedAt).not.toBeNull();
    expect(saved.tyres.map(t => t.state)).toEqual(['pending_analysis', 'pending_analysis']);
  });

  test('Try again on a pending tyre retries the analyzer and stays pending', async () => {
    await startTwoTyres('ABC-1');
    await captureAndAnalyse();
    expect(await screen.findByText('Analysis pending')).toBeTruthy();
    await press('Try again');
    await tick(0);
    expect(await screen.findByText('Analysis pending')).toBeTruthy();
    expect(useInspectionStore.getState().inspections[0].tyres[0].state).toBe('pending_analysis');
  });
});

test('a real analysis error still shows the failure screen, not pending', async () => {
  const analyzer = new TfliteTyreAnalyzer();
  analyzer.load = async () => {};
  analyzer.analyse = async () => {
    throw new Error('interpreter crashed');
  };
  jest.spyOn(ml, 'getAnalyzer').mockReturnValue(analyzer);
  await startTwoTyres('ABC-2');
  await captureAndAnalyse();
  expect(await screen.findByText("This tyre couldn't be analysed.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Scan this tyre again' })).toBeTruthy();
  expect(useInspectionStore.getState().inspections[0].tyres[0].state).toBe('failed');
});

test('demo flow: the shared PDF is labelled Demo data; a PDF failure is reported', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await startTwoTyres('DEMO-1');
  await captureAndAnalyse();
  await tick(5_000);
  expect(await screen.findByText('6.2 mm')).toBeTruthy();
  await press('Next tyre');
  await press('Finish and view report');
  expect(await screen.findByText('Tyre report')).toBeTruthy();
  expect(screen.getByText("1 tyre wasn't scanned.")).toBeTruthy();

  (generatePDF as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  await press('Share report');
  await tick(0);
  expect(alert).toHaveBeenCalledWith('Share report', SHARE_FAILED_MESSAGE);
  expect(Share.open).not.toHaveBeenCalled();

  await press('Share report');
  await tick(0);
  const html = (generatePDF as jest.Mock).mock.calls[1][0].html as string;
  expect(html).toContain('Demo data');
  expect(html).toContain('6.2 mm');
  expect(Share.open).toHaveBeenCalledTimes(1);
});
