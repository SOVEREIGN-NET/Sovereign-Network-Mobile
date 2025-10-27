/**
 * Design System Tokens
 * Centralized theme configuration for the entire app
 */

export const colors = {
  // Primary Brand Colors
  primary: '#00d4ff',
  primary_dark: '#00a8cc',
  primary_light: '#33e0ff',

  // Backgrounds
  bg_darkest: '#0f0f1e',      // Main app background
  bg_dark: '#1a1a2e',         // Cards, modals
  bg_darker: '#16213e',       // Darker cards, nested elements
  bg_medium: '#16213e',       // Buttons, active states
  bg_light: '#2a2a3e',        // Borders, dividers, disabled states
  bg_lighter: '#3a3a4e',      // Hover states
  surface: '#1a1a2e',         // Surface/card backgrounds

  // Text Colors
  text_primary: '#ffffff',    // Primary text
  text_secondary: '#cccccc',  // Secondary text, descriptions
  text_tertiary: '#888888',   // Disabled text, hints
  text_placeholder: '#666666',

  // Semantic Colors
  success: '#51cf66',         // Success states
  success_dark: '#37b24d',
  error: '#ff6b6b',           // Error states
  error_dark: '#fa5252',
  warning: '#ffd43b',         // Warning states
  warning_dark: '#f9ca24',
  info: '#00d4ff',            // Info (same as primary)
  info_dark: '#0099cc',

  // Bright Semantic (for status indicators)
  alert_success: '#00ff00',
  alert_error: '#ff4444',
  alert_warning: '#ffaa00',

  // Utility
  black: '#000000',
  white: '#ffffff',
  transparent: 'transparent',

  // Borders
  border: '#2a2a3e',
  border_light: '#3a3a4e',
} as const;

export const spacing = {
  // Spacing scale
  xs: 4,      // Minimal spacing
  sm: 8,      // Small gaps
  md: 12,     // Medium gaps (default padding)
  lg: 16,     // Large gaps (default padding for cards)
  xl: 24,     // Extra large spacing
  '2xl': 32,  // Large sections
  '3xl': 48,  // Major sections
} as const;

export const typography = {
  // Font Sizes
  size: {
    xs: 11,    // Small labels, metadata
    sm: 12,    // Secondary text, captions
    base: 13,  // Body text, descriptions
    md: 14,    // Primary body text, button text
    lg: 16,    // Emphasized text, large labels
    xl: 18,    // Card titles, section headers
    '2xl': 20, // Screen titles, important headings
    '3xl': 24, // Icon sizes
    '4xl': 36, // Large numbers, balances
    '5xl': 48, // Avatar emoji
  },

  // Font Weights
  weight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  // Line Heights
  lineHeight: {
    tight: 18,
    normal: 20,
    relaxed: 24,
  },
} as const;

export const borderRadius = {
  // Border radius scale
  sm: 3,      // Health bars, small elements
  base: 4,    // Buttons, small inputs
  md: 6,      // Input fields
  lg: 8,      // Cards, containers
  xl: 12,     // Large cards (main pattern)
  full: 9999, // Circular elements
} as const;

export const shadows = {
  // Elevation shadows (currently not used, but reserved)
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  md: {
    shadowColor: 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  lg: {
    shadowColor: 'rgba(0, 0, 0, 0.25)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 15,
  },
} as const;

export const breakpoints = {
  // Screen size breakpoints (for responsive design)
  xs: 0,
  sm: 320,
  md: 480,
  lg: 768,
  xl: 1024,
} as const;

export const theme = {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
  breakpoints,
} as const;

export type Theme = typeof theme;
export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Typography = typeof typography;
export type BorderRadius = typeof borderRadius;
export type Shadows = typeof shadows;

export default theme;
