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

// VisionCamera is native. Tests control permission and device through `__mock`.
jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const mock = {
    status: 'authorized',
    answer: 'authorized',
    device: { position: 'back', hasTorch: true, hasFlash: true },
  };
  return {
    __mock: mock,
    VisionCamera: {
      get cameraPermissionStatus() {
        return mock.status;
      },
      requestCameraPermission: jest.fn(async () => {
        mock.status = mock.answer;
        return mock.status === 'authorized';
      }),
    },
    Camera: props => React.createElement(View, { testID: 'camera-preview', style: props.style }),
    useCameraDevice: () => mock.device ?? undefined,
    useFrameOutput: () => ({}),
    CommonResolutions: { HD_16_9: { width: 720, height: 1280 } },
    HybridFrameConverter: {},
  };
});

jest.mock('react-native-worklets', () => ({
  createSynchronizable: initial => {
    let value = initial;
    return { getBlocking: () => value, setBlocking: v => (value = v) };
  },
  scheduleOnRN: (fn, ...args) => fn(...args),
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({ unlink: jest.fn(async () => {}) }));
