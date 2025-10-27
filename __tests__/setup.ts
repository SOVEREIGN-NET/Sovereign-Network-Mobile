/**
 * Test Setup File
 * Runs before all tests
 */

// Mock React Native modules
jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  FlatList: 'FlatList',
  SafeAreaView: 'SafeAreaView',
  Switch: 'Switch',
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
    View: 'Animated.View',
    timing: jest.fn(() => ({
      start: jest.fn(),
    })),
    spring: jest.fn(() => ({
      start: jest.fn(),
    })),
    Value: jest.fn(),
  },
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }),
  SafeAreaProvider: ({ children }: any) => children,
}));

// Suppress console errors in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
