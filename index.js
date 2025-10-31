/**
 * @format
 */

import { AppRegistry } from 'react-native';

// Initialize Firebase before any other imports
import '@react-native-firebase/app';
import '@react-native-firebase/analytics';
import '@react-native-firebase/crashlytics';

import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
