/* eslint-env jest */
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// MMKV's own test mock, without loading the native Nitro module.
jest.mock('react-native-mmkv', () => {
  const { createMockMMKV } = require('react-native-mmkv/lib/createMMKV/createMockMMKV');
  return { createMMKV: config => createMockMMKV(config) };
});

jest.mock('react-native-haptic-feedback', () => ({ trigger: jest.fn() }));

// Tests pass a MemoryInspectionRepository to <App />; SQLite itself is native.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => {
    throw new Error('SQLite is not available in tests. Pass a MemoryInspectionRepository.');
  },
}));
