module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // Use lucide's prebuilt CommonJS bundle; transforming its ESM icons is very slow.
  moduleNameMapper: {
    // Metro resolves require('…tflite') to an asset id (a number); do the same in tests.
    '\\.tflite$': '<rootDir>/jest/tfliteAssetStub.js',
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*|nitro-core|rn-mlkit-ocr|@op-engineering|@dr.pogodin)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
