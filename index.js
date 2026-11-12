/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import App from './src/app/App';
import { name as appName } from './app.json';
import { diagnosticsConfig } from './src/config/diagnostics';
import { setSidewallDebug } from './src/ml/ocr/sidewallDebug';
import { setTreadDebug } from './src/ml/services/treadDebug';
import { setDebugLogBuffer } from './src/utils/debugLogBuffer';

// [SidewallOCR] logs in development builds only (src/config/diagnostics.ts).
setSidewallDebug(diagnosticsConfig.sidewallOcrLogs);
// [TreadWear] logs while tread wear is verified on phones (src/config/diagnostics.ts).
setTreadDebug(diagnosticsConfig.treadWearLogs);
// Staging: keep the last 300 of both in memory for "Copy logs", even in Release (src/config/diagnostics.ts).
setDebugLogBuffer(diagnosticsConfig.enableStagingLogs);

if (__DEV__) {
  // Hides only the JS LogBox copy of this native error. The native RedBox is
  // stopped by the debug stub in ios/TyreKitBay/SceneDelegate.swift.
  LogBox.ignoreLogs([
    'Unable to find module for SampleTurboModule',
    // "Copy logs" (staging) uses React Native's own Clipboard, which warns that it moved (DECISIONS.md 2026-11-12).
    'Clipboard has been extracted from react-native core',
  ]);
}

AppRegistry.registerComponent(appName, () => App);
