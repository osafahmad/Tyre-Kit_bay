/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './src/app/App';
import { name as appName } from './app.json';
import { diagnosticsConfig } from './src/config/diagnostics';
import { setSidewallDebug } from './src/ml/ocr/sidewallDebug';

// TEMPORARY: [SidewallOCR] device logs in every build (src/config/diagnostics.ts).
setSidewallDebug(diagnosticsConfig.sidewallOcrLogs);

AppRegistry.registerComponent(appName, () => App);
