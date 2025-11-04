/**
 * Theme Context
 * Manages global theme state (light/charcoal) for the entire app
 */

import React, { createContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStorage } from '../services/NativeStorage';
import { ThemeType, getThemeColors } from '../theme/tokens';

// Use native storage on Android, AsyncStorage on iOS
const storage = Platform.OS === 'android' ? NativeStorage : AsyncStorage;

const THEME_STORAGE_KEY = 'app-theme-preference';

export interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => Promise<void>;
  colors: ReturnType<typeof getThemeColors>;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Theme Provider Component
 * Wraps the app and provides theme state and methods to all children
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>('charcoal');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on app start
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await storage.getItem(THEME_STORAGE_KEY);
        if (savedTheme && (savedTheme === 'light' || savedTheme === 'charcoal')) {
          setThemeState(savedTheme as ThemeType);
        }
      } catch (error) {
        console.warn('Failed to load theme preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemePreference();
  }, []);

  // Function to change theme and persist preference
  const setTheme = useCallback(
    async (newTheme: ThemeType) => {
      try {
        setThemeState(newTheme);
        await storage.setItem(THEME_STORAGE_KEY, newTheme);
      } catch (error) {
        console.warn('Failed to save theme preference:', error);
        // Revert state on error
        setThemeState(theme);
      }
    },
    [theme],
  );

  // Get colors for current theme
  const colors = useMemo(() => getThemeColors(theme), [theme]);

  const value: ThemeContextType = useMemo(
    () => ({
      theme,
      setTheme,
      colors,
    }),
    [theme, setTheme, colors],
  );

  // Don't render children until theme is loaded
  if (isLoading) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * Hook to use theme context
 * Must be used within ThemeProvider
 */
export const useTheme = (): ThemeContextType => {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
