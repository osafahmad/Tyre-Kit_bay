import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../src/app/App';
import { MemoryInspectionRepository } from '../src/features/inspection/repository';

test('app renders the Welcome screen', async () => {
  await render(<App repository={new MemoryInspectionRepository()} />);
  expect(await screen.findByText('Check tyre condition, size, and age with your phone camera.')).toBeTruthy();
});

test('storage failure is shown, not ignored', async () => {
  const broken = new MemoryInspectionRepository();
  broken.loadAll = () => Promise.reject(new Error('disk'));
  await render(<App repository={broken} />);
  expect(await screen.findByText("Saved inspections couldn't be opened")).toBeTruthy();
});
