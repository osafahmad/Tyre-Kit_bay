import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as fs from '@dr.pogodin/react-native-fs';
import App from '../../app/App';
import { useInspectionStore } from '../../features/inspection/store';
import { settings } from '../../features/inspection/settings';
import { MemoryInspectionRepository } from '../../features/inspection/repository';
import { useCaptureBlock } from '../../features/capture/captureBlock';
import type { CaptureOutcome, SessionSnapshot } from '../../features/capture/captureSession';

// Hand-driven capture: tests set the snapshot the screens see.
const mockCapture = {
  snapshot: { status: 'starting', collecting: false, accepted: 0, outcome: null } as SessionSnapshot,
  active: [] as boolean[],
  start: jest.fn(),
  finish: jest.fn(() => false),
  giveUp: jest.fn(),
  sweep: { travel: 0, reversed: false },
  rerender: null as null | (() => void),
};
jest.mock('../../features/capture/useTyreCapture', () => {
  const ReactMock = require('react');
  return {
    useTyreCapture: ({ active }: { active: boolean }) => {
      const [, force] = ReactMock.useReducer((n: number) => n + 1, 0);
      mockCapture.rerender = force;
      mockCapture.active.push(active);
      return {
        frameOutput: {},
        setGuide: () => {},
        snapshot: mockCapture.snapshot,
        lowStorage: false,
        sweep: mockCapture.sweep,
        start: mockCapture.start,
        finish: mockCapture.finish,
        giveUp: mockCapture.giveUp,
      };
    },
  };
});

const setSnapshot = async (patch: Partial<SessionSnapshot>) =>
  act(async () => {
    mockCapture.snapshot = { ...mockCapture.snapshot, ...patch };
    mockCapture.rerender?.();
  });

const press = async (name: string | RegExp) =>
  fireEvent.press(await screen.findByRole('button', { name }));

const current = () => {
  const s = useInspectionStore.getState();
  return s.inspections.find(i => i.id === s.currentId)!;
};

beforeEach(() => {
  useInspectionStore.getState().replaceAll([], null);
  settings.setHasSeenWalkthrough(true);
  settings.setCurrentInspectionId(null);
  useCaptureBlock.getState().setBlocked(false);
  mockCapture.snapshot = { status: 'starting', collecting: false, accepted: 0, outcome: null };
  mockCapture.active = [];
  mockCapture.sweep = { travel: 0, reversed: false };
  jest.clearAllMocks();
  (fs.getFSInfo as jest.Mock).mockResolvedValue({ freeSpace: 10e9 });
});

/** Home → skip vehicle → 2 tyres → Sidewall capture for Front. */
async function toSidewall() {
  await render(<App repository={new MemoryInspectionRepository()} />);
  await press('Start scan');
  await press('Skip');
  await press('Skip');
  await fireEvent.press(await screen.findByRole('radio', { name: '2' }));
  await press('Scan 2 tyres');
  expect(await screen.findByText('Step 1 of 2: sidewall')).toBeTruthy();
}

const done = (keep: string[]): CaptureOutcome => ({ kind: 'done', keep, discard: [] });

describe('sidewall capture', () => {
  test('live camera, status pill, and Capture starts collecting', async () => {
    await toSidewall();
    expect(screen.getByTestId('camera-preview')).toBeTruthy();
    expect(screen.getByText('Focusing…')).toBeTruthy();
    await setSnapshot({ status: 'ok' });
    expect(screen.getByText('Ready to capture')).toBeTruthy();
    await press('Capture sidewall');
    expect(mockCapture.start).toHaveBeenCalled();
    await setSnapshot({ collecting: true, accepted: 3 });
    expect(screen.getByText('3 of 8 frames')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Capture sidewall' })).toBeDisabled();
  });

  test('kept frames are saved to the tyre and Sidewall captured opens', async () => {
    await toSidewall();
    const temp = Array.from({ length: 8 }, (_, i) => `/caches/capture-tmp/${i}.jpg`);
    await setSnapshot({ outcome: done(temp) });
    expect(await screen.findByText('Sidewall captured')).toBeTruthy();
    const tyre = current().tyres[0];
    expect(tyre.state).toBe('capturing_tread');
    expect(tyre.sidewallFrames).toHaveLength(8);
    tyre.sidewallFrames.forEach(p => expect(p).toMatch(new RegExp(`^frames/${current().id}/${tyre.id}/sidewall_`)));
    expect(fs.moveFile).toHaveBeenCalledTimes(8);
  });

  test('a dark sidewall opens Capture problem with the real reason', async () => {
    await toSidewall();
    await setSnapshot({ outcome: { kind: 'problem', reason: 'dark', discard: ['/caches/capture-tmp/x.jpg'] } });
    expect(await screen.findByText('Too dark to read the sidewall')).toBeTruthy();
    expect(fs.unlink).toHaveBeenCalledWith('/caches/capture-tmp/x.jpg');
    expect(current().tyres[0].errorReason).toBe('dark');
    // Retry goes back to the same stage (a fresh capture session).
    mockCapture.snapshot = { status: 'starting', collecting: false, accepted: 0, outcome: null };
    await press('Scan sidewall again');
    expect(await screen.findByText('Step 1 of 2: sidewall')).toBeTruthy();
  });

  test('low storage: the spec message shows and capture is blocked', async () => {
    (fs.getFSInfo as jest.Mock).mockResolvedValue({ freeSpace: 1024 });
    await toSidewall();
    expect(
      await screen.findByText(
        "There isn't enough storage to save these frames. Free up some space and try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Capture sidewall' })).toBeDisabled();
    expect(mockCapture.active[mockCapture.active.length - 1]).toBe(false);
  });

  test('capture pauses while the leave dialog is open', async () => {
    await toSidewall();
    await act(async () => useCaptureBlock.getState().setBlocked(true));
    expect(mockCapture.active[mockCapture.active.length - 1]).toBe(false);
  });
});

describe('tread capture', () => {
  async function toTread() {
    await toSidewall();
    await setSnapshot({ outcome: done(Array.from({ length: 8 }, (_, i) => `/caches/capture-tmp/s${i}.jpg`)) });
    await screen.findByText('Sidewall captured');
    mockCapture.snapshot = { status: 'ok', collecting: true, accepted: 0, outcome: null };
    await press('Scan tread');
    expect(await screen.findByText('Step 2 of 2: tread')).toBeTruthy();
  }

  test('progress, Finish sweep needs more frames, then done opens Frames captured', async () => {
    await toTread();
    await setSnapshot({ accepted: 4 });
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('Image is clear')).toBeTruthy();
    await press('Finish sweep');
    expect(mockCapture.finish).toHaveBeenCalled();
    expect(screen.getByText('Keep going. A few more clear frames are needed.')).toBeTruthy();

    await setSnapshot({ accepted: 10, outcome: done(Array.from({ length: 10 }, (_, i) => `/caches/capture-tmp/t${i}.jpg`)) });
    expect(await screen.findByText('Frames captured')).toBeTruthy();
    expect(screen.getByText('8 clear frames')).toBeTruthy();
    expect(screen.getByText('10 clear frames')).toBeTruthy();
    expect(current().tyres[0].state).toBe('captured');
  });

  test('chevrons fill with rightward sweep travel; moving left freezes them with Move right (owner 2026-11-12)', async () => {
    await toTread();
    const guide = () => screen.getByTestId('tread-sweep-guide').props.accessibilityValue.now;
    expect(guide()).toBe(0);
    await act(async () => {
      mockCapture.sweep = { travel: 1, reversed: false };
      mockCapture.rerender?.();
    });
    expect(guide()).toBe(50);
    await act(async () => {
      mockCapture.sweep = { travel: 1, reversed: true };
      mockCapture.rerender?.();
    });
    await setSnapshot({ status: 'reverse', accepted: 3 });
    expect(guide()).toBe(50);
    expect(screen.getByText('Move right')).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
  });

  test('Having trouble gives up with the session reason', async () => {
    await toTread();
    await press('Having trouble');
    expect(mockCapture.giveUp).toHaveBeenCalled();
    await setSnapshot({ outcome: { kind: 'problem', reason: 'glare', discard: [] } });
    expect(await screen.findByText('Too much glare')).toBeTruthy();
    expect(screen.getByText('Turn off the flash')).toBeTruthy();
    expect(screen.queryByText("The tyre wasn't detected")).toBeNull();
    await press('Skip this tyre');
    expect(await screen.findByText('Not scanned')).toBeTruthy();
  });
});

test('unsteady sidewall: its own reason and a clear retry', async () => {
  await toSidewall();
  await setSnapshot({ outcome: { kind: 'problem', reason: 'unsteady', discard: [] } });
  expect(await screen.findByText('Hold the phone steady')).toBeTruthy();
  expect(screen.getByText('Hold the phone with both hands')).toBeTruthy();
  mockCapture.snapshot = { status: 'starting', collecting: false, accepted: 0, outcome: null };
  await press('Scan sidewall again');
  expect(await screen.findByText('Step 1 of 2: sidewall')).toBeTruthy();
});

test('no clear cause on the sidewall: stage-specific tips, never "not detected"', async () => {
  await toSidewall();
  await setSnapshot({ outcome: { kind: 'problem', reason: 'too_few_frames', discard: [] } });
  expect(await screen.findByText('Not enough clear frames')).toBeTruthy();
  expect(screen.getByText('Keep the tyre inside the circle')).toBeTruthy();
  expect(screen.queryByText("The tyre wasn't detected")).toBeNull();
});

test('scanning a tyre again deletes its saved frames', async () => {
  await toSidewall();
  await setSnapshot({ outcome: done(Array.from({ length: 8 }, (_, i) => `/caches/capture-tmp/${i}.jpg`)) });
  await screen.findByText('Sidewall captured');
  const { id: inspectionId, tyres } = current();
  await act(async () => useInspectionStore.getState().resetTyre(tyres[0].id));
  expect(fs.unlink).toHaveBeenCalledWith(`/docs/frames/${inspectionId}/${tyres[0].id}`);
  expect(current().tyres[0].sidewallFrames).toEqual([]);
});
