/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import App from './src/app/App';
import { name as appName } from './app.json';
import { diagnosticsConfig } from './src/config/diagnostics';
import { setSidewallDebug } from './src/ml/ocr/sidewallDebug';
import { setTreadDebug } from './src/ml/services/treadDebug';

// [SidewallOCR] logs in development builds only (src/config/diagnostics.ts).
setSidewallDebug(diagnosticsConfig.sidewallOcrLogs);
// [TreadWear] logs while tread wear is verified on phones (src/config/diagnostics.ts).
setTreadDebug(diagnosticsConfig.treadWearLogs);

if (__DEV__) {
  // Hides only the JS LogBox copy of this native error. The native RedBox is
  // stopped by the debug stub in ios/TyreKitBay/SceneDelegate.swift.
  LogBox.ignoreLogs(['Unable to find module for SampleTurboModule']);
}

AppRegistry.registerComponent(appName, () => App);
