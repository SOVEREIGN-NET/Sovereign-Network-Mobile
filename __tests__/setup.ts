/**
 * Test Setup File
 * Runs before all tests
 */

// Mock React Native modules BEFORE any imports
jest.mock('react-native', () => {
  const React = require('react');
  return {
    ActivityIndicator: 'ActivityIndicator',
    View: ({ children }: any) => React.createElement('View', {}, children),
    Text: ({ children }: any) => React.createElement('Text', {}, children),
    TouchableOpacity: ({ children, onPress }: any) =>
      React.createElement('TouchableOpacity', { onPress }, children),
    ScrollView: ({ children }: any) => React.createElement('ScrollView', {}, children),
    Modal: ({ children }: any) => React.createElement('Modal', {}, children),
    FlatList: ({ data, renderItem }: any) =>
      React.createElement('FlatList', {}, data?.map((item: any, i: any) =>
        React.createElement('View', { key: i }, renderItem?.({ item }))
      )),
    SafeAreaView: ({ children }: any) => React.createElement('SafeAreaView', {}, children),
    Switch: 'Switch',
    StatusBar: 'StatusBar',
    Share: {
      share: jest.fn().mockResolvedValue({ action: 'sharedAction' }),
    },
    StyleSheet: {
      create: (styles: any) => styles,
    },
    AsyncStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    },
    Animated: {
      View: ({ children }: any) => React.createElement('Animated.View', {}, children),
      timing: jest.fn(() => ({
        start: jest.fn(),
      })),
      spring: jest.fn(() => ({
        start: jest.fn(),
      })),
      Value: jest.fn(),
      createValue: jest.fn(),
    },
    useColorScheme: jest.fn(() => 'dark'),
    Platform: {
      OS: 'ios',
      select: (obj: any) => obj.ios,
    },
    NativeModules: {
      NativeStorage: {
        setItem: jest.fn().mockResolvedValue(undefined),
        getItem: jest.fn().mockResolvedValue(null),
        removeItem: jest.fn().mockResolvedValue(undefined),
      },
    },
    Pressable: ({ children, onPress }: any) =>
      React.createElement('Pressable', { onPress }, children),
    requireNativeComponent: jest.fn(() => 'LinearGradient'),
  };
}, { virtual: true });

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

// Mock react-native-linear-gradient
jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  return React.forwardRef(({ children }: any, ref: any) =>
    React.createElement('LinearGradient', { ref }, children)
  );
}, { virtual: true });

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }),
    SafeAreaProvider: ({ children }: any) => React.createElement('SafeAreaProvider', {}, children),
  };
}, { virtual: true });

// Mock React Navigation modules
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: ({ children }: any) => React.createElement('NavigationContainer', {}, children),
    DefaultTheme: {},
    DarkTheme: {},
    useColorScheme: jest.fn(() => 'dark'),
  };
}, { virtual: true });

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }: any) => React.createElement('BottomTabNavigator', {}, children),
      Screen: ({ children }: any) => React.createElement('BottomTabScreen', {}, children),
    }),
  };
}, { virtual: true });

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }: any) => React.createElement('StackNavigator', {}, children),
      Screen: ({ children }: any) => React.createElement('StackScreen', {}, children),
    }),
  };
}, { virtual: true });

// Suppress console errors in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
