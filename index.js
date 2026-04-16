/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Silence console.log and console.warn in production builds.
// console.error is kept so crash-reporting tools still capture fatal messages.
if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
}

AppRegistry.registerComponent(appName, () => App);
