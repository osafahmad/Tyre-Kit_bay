import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Button, ResultRow, ScanProgressRing, StatusBadge, IconButton } from '..';
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

test('scan progress ring is a progressbar in percent, clamps its value, and draws no numbers', async () => {
  const ring = () => screen.getByRole('progressbar', { name: 'Plate read progress' });
  const settle = () => act(async () => new Promise<void>(resolve => setTimeout(resolve, 400)));
  const { rerender } = await render(<ScanProgressRing progress={2 / 3} accessibilityLabel="Plate read progress" />);
  expect(ring().props.accessibilityValue).toEqual({ min: 0, max: 100, now: 67 });
  expect(screen.queryByText(/\d/)).toBeNull();
  await rerender(<ScanProgressRing progress={4} accessibilityLabel="Plate read progress" />);
  await settle();
  expect(ring().props.accessibilityValue.now).toBe(100);
  await rerender(<ScanProgressRing progress={Number.NaN} accessibilityLabel="Plate read progress" />);
  await settle();
  expect(ring().props.accessibilityValue.now).toBe(0);
});
