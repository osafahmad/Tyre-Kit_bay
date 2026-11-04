import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as VC from 'react-native-vision-camera';
import App from '../../app/App';
import { useInspectionStore } from '../../features/inspection/store';
import { settings } from '../../features/inspection/settings';
import { navigationRef } from '../../app/navigation';
import { MemoryInspectionRepository } from '../../features/inspection/repository';

let repo: MemoryInspectionRepository;

// No camera: capture screens use the labelled development simulation.
const camera = (VC as unknown as { __mock: { device: unknown } }).__mock;

beforeEach(() => {
  camera.device = undefined;
  jest.useFakeTimers();
  repo = new MemoryInspectionRepository();
  settings.setCurrentInspectionId(null);
  useInspectionStore.getState().replaceAll([], null);
  settings.setHasSeenWalkthrough(false);
});

afterEach(() => {
  jest.useRealTimers();
});

const press = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));

async function goHomeFromWelcome() {
  await press('Get started');
  await press('Skip');
  await press('Not now');
  await screen.findByText('Ready to inspect');
}

test('first launch: Welcome, walkthrough Skip saves the flag, then Home', async () => {
  await render(<App repository={repo} />);
  expect(await screen.findByText('Check tyre condition, size, and age with your phone camera.')).toBeTruthy();
  await press('Get started');
  expect(await screen.findByText('Scan the vehicle')).toBeTruthy();
  await press('Skip');
  expect(settings.hasSeenWalkthrough()).toBe(true);
  expect(await screen.findByText('Allow camera access')).toBeTruthy();
  await press('Not now');
  expect(await screen.findByText('Ready to inspect')).toBeTruthy();
});

test('skip plate and chassis, then select tyres', async () => {
  await render(<App repository={repo} />);
  await goHomeFromWelcome();
  await press('Start scan');
  expect(await screen.findByText('Scan number plate')).toBeTruthy();
  await press('Skip');
  expect(await screen.findByText('Scan chassis number')).toBeTruthy();
  await press('Skip');
  expect(await screen.findByText('Select tyres to scan')).toBeTruthy();

  // Default 4, all selected.
  expect(screen.getByRole('button', { name: 'Scan 4 tyres' })).toBeTruthy();

  // 6 selects every position in that layout.
  await fireEvent.press(screen.getByRole('radio', { name: '6' }));
  expect(screen.getByRole('button', { name: 'Scan 6 tyres' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Right rear inner' })).toBeTruthy();

  // 2 tyres, toggle one off, then none.
  await fireEvent.press(screen.getByRole('radio', { name: '2' }));
  expect(screen.getByRole('button', { name: 'Scan 2 tyres' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Rear' }));
  expect(screen.getByRole('button', { name: 'Scan 1 tyre' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Front' }));
  expect(screen.getByText('Select at least one tyre')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Scan \d/ })).toBeNull();
});

test('two-tyre inspection in order, with a skipped tyre, ends in a labelled demo report', async () => {
  await render(<App repository={repo} />);
  await goHomeFromWelcome();
  await press('Start scan');
  await press('Type it');
  const plate = await screen.findByLabelText('Number plate, optional');
  await fireEvent.changeText(plate, 'abc-1234');
  await press('Continue');
  await fireEvent.press(await screen.findByRole('radio', { name: '2' }));
  await press('Scan 2 tyres');

  // Front tyre first.
  expect(await screen.findByText('Front tyre')).toBeTruthy();
  expect(screen.getByText('Tyre 1 of 2')).toBeTruthy();
  await press('Capture sidewall');
  expect(await screen.findByText('Sidewall captured')).toBeTruthy();
  // Nothing was read, so nothing is filled in.
  expect(screen.getByLabelText('Tyre size').props.value).toBe('');
  await press('Scan tread');

  // Finish sweep before enough frames shows the hint.
  await press('Finish sweep');
  expect(await screen.findByText('Keep going. A few more clear frames are needed.')).toBeTruthy();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(await screen.findByText('Frames captured')).toBeTruthy();
  expect(screen.getByText('10 clear frames')).toBeTruthy();
  await press('Analyse tyre');
  expect(await screen.findByText('Analysing tyre')).toBeTruthy();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5_000);
  });
  expect(await screen.findByText('6.2 mm')).toBeTruthy();
  expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Not read').length).toBeGreaterThan(0);
  await press('Next tyre');

  // Progress shows the rear tyre next.
  expect(await screen.findByText('1 of 2 tyres scanned')).toBeTruthy();
  expect(screen.getByText('Next')).toBeTruthy();
  await press('Scan rear tyre');
  await press('Capture sidewall');
  await press('Scan tread');
  await press('Having trouble');
  expect(await screen.findByText('Not enough clear frames')).toBeTruthy();
  await press('Skip this tyre');

  expect(await screen.findByText('Not scanned')).toBeTruthy();
  await press('View report');
  expect(await screen.findByText('Tyre report')).toBeTruthy();
  expect(screen.getByText(/ABC-1234/)).toBeTruthy();
  expect(screen.getByText('All scanned tyres are in good condition')).toBeTruthy();
  expect(screen.getByText("1 tyre wasn't scanned.")).toBeTruthy();
  expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0);
});

test('confirm plate saves it and moves on to the chassis scan', async () => {
  await render(<App repository={repo} />);
  await goHomeFromWelcome();
  await press('Start scan');
  await screen.findByText('Scan number plate');
  await act(async () => navigationRef.navigate('PlateConfirm', { plate: 'ABC-1234' }));
  expect(await screen.findByText('Plate found')).toBeTruthy();
  await press('Confirm plate');
  expect(await screen.findByText('Scan chassis number')).toBeTruthy();
  const state = useInspectionStore.getState();
  expect(state.inspections.find(i => i.id === state.currentId)?.plate).toBe('ABC-1234');
});
