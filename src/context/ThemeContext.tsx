/**
 * Theme Context
 * Manages global theme state (light/charcoal) for the entire app
 */

import React, { createContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStorage } from '../services/NativeStorage';
import { ThemeType, applyTheme, getThemeColors } from '../theme/tokens';

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

  // Apply the initial theme synchronously so static `import { colors }`
  // consumers read the right palette on their first render. AsyncStorage
  // reads asynchronously below — if it returns a different choice we
  // mutate and bump the remount key to propagate.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load saved theme preference on app start
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await storage.getItem(THEME_STORAGE_KEY);
        if (savedTheme && (savedTheme === 'light' || savedTheme === 'charcoal')) {
          applyTheme(savedTheme as ThemeType);
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
      const previous = theme;
      try {
        // Mutate the shared `colors` object FIRST, then update state —
        // this ordering guarantees children re-rendered by the state
        // change read the new palette (not the old one they were
        // rendered with last).
        applyTheme(newTheme);
        setThemeState(newTheme);
        await storage.setItem(THEME_STORAGE_KEY, newTheme);
      } catch (error) {
        console.warn('Failed to save theme preference:', error);
        // Revert state AND palette on error so both sources of truth
        // stay consistent.
        applyTheme(previous);
        setThemeState(previous);
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

  // Key the subtree by the current theme so the whole tree remounts
  // when the user toggles. That's what forces screens doing the static
  // `import { colors }` to re-read the (now mutated) module-level
  // `colors` object. Wrapping in a View keeps the theme switch
  // invisible to consumers that weren't keyed already.
  return (
    <ThemeContext.Provider value={value}>
      <View key={theme} style={{ flex: 1 }}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
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
