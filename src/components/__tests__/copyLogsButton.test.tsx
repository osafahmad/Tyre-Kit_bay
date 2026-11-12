import React from 'react';
import { Clipboard } from 'react-native';

// React Native's own Clipboard (warns once that it moved); silenced here.
jest.spyOn(console, 'warn').mockImplementation(() => {});
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { COPIED_MS, CopyLogsButton } from '../CopyLogsButton';
import { recordDebugLog, setDebugLogBuffer } from '../../utils/debugLogBuffer';

afterEach(() => {
  setDebugLogBuffer(false);
  jest.useRealTimers();
});

test('hidden unless staging logs are on', async () => {
  await render(<CopyLogsButton />);
  expect(screen.queryByTestId('copy-logs')).toBeNull();
});

test('copies the buffered lines and shows Copied briefly', async () => {
  jest.useFakeTimers();
  const set = jest.spyOn(Clipboard, 'setString').mockImplementation(() => {});
  setDebugLogBuffer(true);
  recordDebugLog('[TreadWear] 10:00:00.000 scan start');
  recordDebugLog('[SidewallOCR] 10:00:01.000 read done');
  await render(<CopyLogsButton />);
  await fireEvent.press(screen.getByText('Copy logs'));
  expect(set).toHaveBeenCalledWith('[TreadWear] 10:00:00.000 scan start\n[SidewallOCR] 10:00:01.000 read done');
  expect(screen.getByText('Copied')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(COPIED_MS);
  });
  expect(screen.getByText('Copy logs')).toBeTruthy();
  set.mockRestore();
});
