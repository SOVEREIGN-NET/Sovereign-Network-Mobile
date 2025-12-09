/**
 * Configuration Service
 * Manages app configuration including node URL
 * Loads from .env file and AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_ZHTP_NODE_URL, DEFAULT_NETWORK_TYPE, APP_DEFAULTS } from '../config';

export interface AppConfig {
  zhtpNodeUrl: string;
  networkType: 'testnet' | 'mainnet';
  useRealAuth: boolean;
}

const CONFIG_KEY = 'app_config';

// Default values from centralized config
// Note: The dev node is pure QUIC - no HTTP/TCP support
const DEFAULT_CONFIG: AppConfig = {
  zhtpNodeUrl: DEFAULT_ZHTP_NODE_URL,
  networkType: DEFAULT_NETWORK_TYPE,
  useRealAuth: !APP_DEFAULTS.useMockData, // Use mock service by default in dev
};

/**
 * Get current app configuration
 * Loads from AsyncStorage or returns defaults
 */
export const getConfig = async (): Promise<AppConfig> => {
  try {
    const saved = await AsyncStorage.getItem(CONFIG_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('Failed to load config from storage:', error);
  }
  return DEFAULT_CONFIG;
};

/**
 * Update app configuration
 * Persists to AsyncStorage for future app launches
 */
export const updateConfig = async (config: Partial<AppConfig>): Promise<AppConfig> => {
  try {
    const current = await getConfig();
    const updated = { ...current, ...config };
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
    console.log('✅ Config updated:', updated);
    return updated;
  } catch (error) {
    console.error('Failed to update config:', error);
    throw error;
  }
};

/**
 * Reset configuration to defaults
 */
export const resetConfig = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CONFIG_KEY);
    console.log('✅ Config reset to defaults');
  } catch (error) {
    console.error('Failed to reset config:', error);
    throw error;
  }
};

/**
 * Initialize configuration from environment
 * Should be called on app startup
 */
export const initializeConfig = async (): Promise<AppConfig> => {
  try {
    const config = await getConfig();

    // If using development environment and node URL not set, try localhost
    if (__DEV__ && config.zhtpNodeUrl === DEFAULT_CONFIG.zhtpNodeUrl) {
      // You can add logic here to auto-discover local nodes
      console.log('Development mode - using default node URL:', config.zhtpNodeUrl);
    }

    console.log('✅ Config initialized:', config);
    return config;
  } catch (error) {
    console.error('Failed to initialize config:', error);
    return DEFAULT_CONFIG;
  }
};

export default {
  getConfig,
  updateConfig,
  resetConfig,
  initializeConfig,
};
