import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Button, CircularProgress, ResultRow, StatusBadge, IconButton } from '..';
import { ChevronLeft } from 'lucide-react-native';

test('every status badge has a text label', async () => {
  await render(
    <>
      <StatusBadge status="good" />
      <StatusBadge status="replace_soon" />
      <StatusBadge status="replace_now" showIcon />
    </>,
  );
  expect(screen.getByText('Good')).toBeTruthy();
  expect(screen.getByText('Replace soon')).toBeTruthy();
  expect(screen.getByText('Replace now')).toBeTruthy();
});

test('result row shows Not read for missing values', async () => {
  await render(
    <>
      <ResultRow label="Make" value={null} />
      <ResultRow label="Model" value="  " />
      <ResultRow label="Tyre size" value="215/65 R15" last />
    </>,
  );
  expect(screen.getAllByText('Not read')).toHaveLength(2);
  expect(screen.getByText('215/65 R15')).toBeTruthy();
});

test('button is labelled and pressable', async () => {
  const onPress = jest.fn();
  await render(<Button label="Start scan" onPress={onPress} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start scan' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('disabled button does not fire', async () => {
  const onPress = jest.fn();
  await render(<Button label="Continue" onPress={onPress} disabled />);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(onPress).not.toHaveBeenCalled();
});

test('icon button has an accessibility label', async () => {
  await render(<IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => {}} />);
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
});

test('logo shows the app name', async () => {
  const { LogoMark } = require('..');
  await render(<LogoMark />);
  expect(screen.getByText('Tyre Kit Bay')).toBeTruthy();
  expect(screen.getByLabelText('Tyre Kit Bay')).toBeTruthy();
});

test('circular progress shows the count, is a progressbar, and clamps out-of-range values', async () => {
  const { rerender } = await render(<CircularProgress value={3} total={8} label="Scanning sidewall frames" />);
  expect(screen.getByText('3/8')).toBeTruthy();
  expect(screen.getByText('Scanning sidewall frames')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Scanning sidewall frames: 3 of 8' }).props.accessibilityValue).toEqual({
    min: 0,
    max: 8,
    now: 3,
  });
  const settle = () => act(async () => new Promise<void>(resolve => setTimeout(resolve, 400)));
  await rerender(<CircularProgress value={11} total={8} label="Scanning sidewall frames" />);
  await settle();
  expect(screen.getByText('8/8')).toBeTruthy();
  await rerender(<CircularProgress value={-2} total={8} label="Scanning sidewall frames" />);
  await settle();
  expect(screen.getByText('0/8')).toBeTruthy();
});
