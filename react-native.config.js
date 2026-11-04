// Google ML Kit's iOS frameworks have no arm64 simulator slice, so they can't
// link into an Apple Silicon simulator build without Rosetta. For simulator-only
// builds run `LINEUP_IOS_SIM=1 pod install`: OCR is then left out on iOS and the
// app falls back to manual entry. Never use this flag for device or release builds.
const iosSimulatorOnly = process.env.LINEUP_IOS_SIM === '1';

module.exports = {
  // Linked into the native projects with `npx react-native-asset@2.3.0`.
  assets: ['./assets/fonts'],
  dependencies: iosSimulatorOnly
    ? { 'rn-mlkit-ocr': { platforms: { ios: null } } }
    : {},
};
