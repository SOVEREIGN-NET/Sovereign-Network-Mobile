/**
 * useNativeSettings Hook
 * Provides access to native phone settings (iOS Settings.app / Android Settings)
 * Syncs with React Native app settings automatically
 */

import { useEffect, useState, useCallback } from 'react';
import { NativeModules } from 'react-native';
import { DEFAULT_SOV_NODE_URL, APP_DEFAULTS } from '../config';

const { NativeSettings } = NativeModules;

export interface DeveloperSettings {
  useMockData: boolean;
  nodeUrl: string;
}

export function useNativeSettings() {
  const [settings, setSettings] = useState<DeveloperSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load settings from native storage
   */
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!NativeSettings) {
        console.warn('NativeSettings module not available');
        return;
      }

      const nativeSettings = await NativeSettings.getAllSettings();

      if (nativeSettings) {
        setSettings({
          useMockData: nativeSettings.useMockData ?? APP_DEFAULTS.useMockData,
          nodeUrl: nativeSettings.nodeUrl ?? DEFAULT_SOV_NODE_URL,
        });
      }
    } catch (err: any) {
      console.error('Failed to load native settings:', err);
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Save settings to native storage
   */
  const saveSettings = useCallback(async (newSettings: Partial<DeveloperSettings>) => {
    try {
      if (!NativeSettings) {
        console.warn('NativeSettings module not available');
        return false;
      }

      const settingsToUpdate = {
        ...(newSettings.useMockData !== undefined && { useMockData: newSettings.useMockData }),
        ...(newSettings.nodeUrl && { nodeUrl: newSettings.nodeUrl }),
      };

      await NativeSettings.updateSettings(settingsToUpdate);

      // Update local state
      setSettings(prev => prev ? { ...prev, ...newSettings } : null);
      return true;
    } catch (err: any) {
      console.error('Failed to save native settings:', err);
      setError(err.message || 'Failed to save settings');
      return false;
    }
  }, []);

  /**
   * Clear all settings
   */
  const clearSettings = useCallback(async () => {
    try {
      if (!NativeSettings) {
        console.warn('NativeSettings module not available');
        return false;
      }

      await NativeSettings.clearSettings();
      setSettings({
        useMockData: APP_DEFAULTS.useMockData,
        nodeUrl: DEFAULT_SOV_NODE_URL,
      });
      return true;
    } catch (err: any) {
      console.error('Failed to clear native settings:', err);
      setError(err.message || 'Failed to clear settings');
      return false;
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    loading,
    error,
    loadSettings,
    saveSettings,
    clearSettings,
  };
}

export default useNativeSettings;
