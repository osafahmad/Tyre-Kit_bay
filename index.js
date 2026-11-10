/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './src/app/App';
import { name as appName } from './app.json';
import { diagnosticsConfig } from './src/config/diagnostics';
import { setSidewallDebug } from './src/ml/ocr/sidewallDebug';

// [SidewallOCR] logs in development builds only (src/config/diagnostics.ts).
setSidewallDebug(diagnosticsConfig.sidewallOcrLogs);

AppRegistry.registerComponent(appName, () => App);
