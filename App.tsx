/**
 * ZHTP Web4 Mobile App
 * React Native cross-platform application for Web4 decentralized internet
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f1e" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default App;
