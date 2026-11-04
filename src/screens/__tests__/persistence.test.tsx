import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as VC from 'react-native-vision-camera';
import App from '../../app/App';
import { useInspectionStore } from '../../features/inspection/store';
import { settings } from '../../features/inspection/settings';
import { MemoryInspectionRepository } from '../../features/inspection/repository';
import { useCaptureBlock } from '../../features/capture/captureBlock';

let repo: MemoryInspectionRepository;

// No camera: capture screens use the labelled development simulation.
const camera = (VC as unknown as { __mock: { device: unknown } }).__mock;

beforeEach(() => {
  camera.device = undefined;
  jest.useFakeTimers();
  repo = new MemoryInspectionRepository();
  useInspectionStore.getState().replaceAll([], null);
  settings.setHasSeenWalkthrough(false);
  settings.setCurrentInspectionId(null);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const press = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));

/** Unmount, wipe in-memory state, and launch again from the same storage. */
async function restart(unmount: () => void | Promise<void>) {
  await act(async () => {
    await unmount();
    await jest.runOnlyPendingTimersAsync();
  });
  useInspectionStore.getState().replaceAll([], null);
  return render(<App repository={repo} />);
}

test('later launches open Home, not the walkthrough', async () => {
  settings.setHasSeenWalkthrough(true);
  await render(<App repository={repo} />);
  expect(await screen.findByText('Ready to inspect')).toBeTruthy();
  expect(screen.queryByText('Check tyre condition, size, and age with your phone camera.')).toBeNull();
  expect(screen.getByText('Your inspections will appear here')).toBeTruthy();
});

test('Get started on the last walkthrough page saves the flag', async () => {
  await render(<App repository={repo} />);
  await press('Get started');
  await press('Next');
  await press('Next');
  // Welcome's own Get started is still mounted underneath; use the walkthrough's.
  const buttons = await screen.findAllByRole('button', { name: 'Get started' });
  await fireEvent.press(buttons[buttons.length - 1]);
  expect(settings.hasSeenWalkthrough()).toBe(true);
  expect(await screen.findByText('Allow camera access')).toBeTruthy();
});

test('an inspection closed mid-tyre resumes where it stopped after a restart', async () => {
  settings.setHasSeenWalkthrough(true);
  const first = await render(<App repository={repo} />);
  await press('Start scan');
  await press('Type it');
  await fireEvent.changeText(await screen.findByLabelText('Number plate, optional'), 'KHI-4420');
  await press('Continue');
  await press('Scan 4 tyres');
  await press('Capture sidewall');
  await fireEvent.changeText(await screen.findByLabelText('Make'), 'Bridgestone');
  await press('Scan tread');
  await screen.findByText('Capturing frames');
  // Let the store's writes reach storage, then "close the app".
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  expect(repo.rows.size).toBe(1);

  await restart(first.unmount);
  expect(await screen.findByText('Unfinished inspection')).toBeTruthy();
  expect(screen.getByText(/KHI-4420/)).toBeTruthy();
  await press('Continue inspection');
  // Sidewall was done, so it reopens that tyre's sidewall review, then the tread.
  expect(await screen.findByText('Sidewall captured')).toBeTruthy();
  expect(screen.getByLabelText('Make').props.value).toBe('Bridgestone');
  await press('Scan tread');
  expect(await screen.findByText('Step 2 of 2: tread')).toBeTruthy();
  expect(screen.getByText('Left front tyre')).toBeTruthy();
  const saved = (await repo.loadAll())[0];
  expect(saved.tyres[0].sidewallDetails.make).toBe('Bridgestone');
});

test('finished inspections persist and show in History with live, hyphen-insensitive search', async () => {
  settings.setHasSeenWalkthrough(true);
  const first = await render(<App repository={repo} />);
  await press('Start scan');
  await press('Type it');
  await fireEvent.changeText(await screen.findByLabelText('Number plate, optional'), 'LEB-7781');
  await press('Continue');
  await fireEvent.press(await screen.findByRole('radio', { name: '2' }));
  await press('Scan 2 tyres');
  await press('Capture sidewall');
  await press('Scan tread');
  await press('Having trouble');
  await press('Skip this tyre');
  await press('Scan rear tyre');
  await press('Capture sidewall');
  await press('Scan tread');
  await press('Having trouble');
  await press('Skip this tyre');
  await press('View report');
  expect(await screen.findByText('No tyres were analysed')).toBeTruthy();
  await press('Done');

  await restart(first.unmount);
  expect(await screen.findByText('Ready to inspect')).toBeTruthy();
  expect(screen.queryByText('Unfinished inspection')).toBeNull();
  expect(screen.getByText('LEB-7781')).toBeTruthy();

  await fireEvent.press(screen.getByRole('tab', { name: 'History' }));
  const search = await screen.findByLabelText('Search inspections by number plate');
  await fireEvent.changeText(search, 'leb7781');
  expect(screen.getByText('LEB-7781')).toBeTruthy();
  await fireEvent.changeText(search, 'XYZ');
  expect(screen.getByText('No inspections match that plate')).toBeTruthy();
});

test('going back out of an unfinished inspection asks first', async () => {
  settings.setHasSeenWalkthrough(true);
  const alert = jest.spyOn(Alert, 'alert');
  await render(<App repository={repo} />);
  await press('Start scan');
  await screen.findByText('Scan number plate');
  await press('Back');
  expect(alert).toHaveBeenCalledWith(
    'Leave this inspection?',
    expect.any(String),
    expect.arrayContaining([
      expect.objectContaining({ text: 'Keep scanning' }),
      expect.objectContaining({ text: 'Save and leave' }),
    ]),
    expect.objectContaining({ cancelable: true }),
  );
  // Capture is paused while the dialog is open.
  expect(useCaptureBlock.getState().blocked).toBe(true);
  expect(screen.getByText('Scan number plate')).toBeTruthy();

  // Save and leave goes Home with Continue inspection offered.
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons.find(b => b.text === 'Save and leave')!.onPress!());
  expect(await screen.findByText('Unfinished inspection')).toBeTruthy();
  expect(useCaptureBlock.getState().blocked).toBe(false);
});
