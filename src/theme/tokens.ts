/**
 * Design System Tokens
 * Centralized theme configuration for the entire app
 */

// Gradient accent colors used across themes
export const gradientAccents = {
  // Pink to Cyan gradient (primary accent)
  gradient_start: '#ff00d4',    // Hot pink/magenta
  gradient_end: '#00d4ff',      // Cyan
} as const;

/**
 * Warm-cream light theme.
 *
 * Deliberately NOT pure-white: pure #FFF is glaring on OLED screens
 * and photographs as blown-out. An opaque, slightly warm off-white
 * reads like paper — softer on the eyes and consistent with the
 * charcoal palette's warm undertone.
 *
 * All text colours are dark enough to pass WCAG AA on the cream
 * surface family (≥ 4.5:1 for body copy). Semantic colours are shifted
 * darker than their charcoal-theme counterparts to preserve contrast
 * on the light surfaces.
 */
const lightThemeColors = {
  // Primary Brand Colors — cyan shifted darker so it reads as an
  // interactive colour on light surfaces instead of washing out.
  primary: '#006d8c',
  primary_dark: '#004d63',
  primary_light: '#0091b8',

  // Backgrounds — warm cream family. `bg_darkest` is the app root;
  // `bg_dark` / `bg_darker` step down for card + nested surfaces so
  // the visual hierarchy still reads on a light scheme.
  bg_darkest: '#F4EFE6',      // Main app background (warm cream)
  bg_dark: '#EDE8DF',         // Cards, modals
  bg_darker: '#E6E0D5',       // Nested cards, buttons, darker cells
  bg_medium: '#EDE8DF',       // Button backgrounds, active states
  bg_light: '#D8D2C5',        // Dividers, disabled states
  bg_lighter: '#DED7CA',      // Hover / pressed states
  surface: '#EDE8DF',         // Canonical card surface

  // Text Colors — dark neutrals, never pure black to match the warm
  // surface tone.
  text_primary: '#1a1916',    // Primary copy (≈ 14.8:1 on bg_darkest)
  text_secondary: '#4a4843',  // Secondary copy
  text_tertiary: '#7a7770',   // Hints, metadata
  text_placeholder: '#9a9790',

  // Semantic Colors — darkened so they remain legible on cream without
  // turning into mud. Names kept identical to the charcoal theme so
  // component code doesn't care which palette is active.
  success: '#1f7a34',
  success_dark: '#145c23',
  error: '#b3261e',
  error_dark: '#8c1a14',
  warning: '#b86200',
  warning_dark: '#8a4800',
  info: '#006d8c',
  info_dark: '#004d63',

  // Bright Semantic (for status indicators) — same intent as the
  // charcoal variant, still legible as solid colours.
  alert_success: '#1f7a34',
  alert_error: '#b3261e',
  alert_warning: '#b86200',

  // Utility
  black: '#000000',
  white: '#ffffff',
  transparent: 'transparent',

  // Borders — a subtle dark hairline reads better than a washed-out
  // primary tint on a light surface.
  border: 'rgba(0, 0, 0, 0.10)',
  border_light: 'rgba(0, 0, 0, 0.06)',
} as const;

// Dark grey theme with gradient accents
const charcoalGreyThemeColors = {
  // Primary Brand Colors - Gradient accents
  primary: gradientAccents.gradient_end,  // Cyan accent
  primary_dark: '#0099cc',
  primary_light: '#33e0ff',

  // Backgrounds - Charcoal grey base
  bg_darkest: '#1a1a1a',      // Main app background (darker charcoal)
  bg_dark: '#2a2a2a',         // Cards, modals
  bg_darker: '#333333',       // Darker cards, nested elements
  bg_medium: '#2f2f2f',       // Buttons, active states
  bg_light: '#3d3d3d',        // Borders, dividers, disabled states
  bg_lighter: '#4a4a4a',      // Hover states
  surface: '#2a2a2a',         // Surface/card backgrounds

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

  // Borders - Subtle gradient accent borders
  border: `rgba(255, 0, 212, 0.06)`,        // Subtle pink gradient border
  border_light: `rgba(0, 212, 255, 0.08)`,  // Subtle cyan border
} as const;

export type ThemeType = 'light' | 'charcoal';

// Theme color map for runtime switching
export const themeColorMap: Record<ThemeType, Record<string, string>> = {
  light: lightThemeColors,
  charcoal: charcoalGreyThemeColors,
} as const;

// Helper function to get colors for a specific theme
export const getThemeColors = (theme: ThemeType) => themeColorMap[theme] as typeof charcoalGreyThemeColors;

/**
 * Live-mutable colour palette shared across the app.
 *
 * Most screens currently do `import { colors } from '../theme'` rather
 * than going through `useTheme()`. Changing the *reference* held by
 * those imports would require a full app restart, so instead we keep
 * a single mutable object and rewrite its properties in place
 * whenever the active theme changes. Consumers that re-render after
 * the mutation (triggered by `ThemeProvider` bumping its remount key)
 * pick up the new values automatically.
 *
 * New code should prefer `useTheme().colors`, which subscribes
 * directly to the current theme and doesn't rely on the mutation
 * trick. `colors` is retained to keep the 100+ existing static
 * imports working without a mass refactor.
 */
const writableColors: { [K in keyof typeof charcoalGreyThemeColors]: string } = {
  ...charcoalGreyThemeColors,
};
export const colors = writableColors as typeof charcoalGreyThemeColors;

/**
 * Rewrites the shared `colors` object in place to reflect the
 * requested theme. Only touches own keys already present on the
 * target palette — never drops a key, so any component reading a
 * colour it expects to exist keeps getting *some* value even if a
 * future palette omits it.
 */
export function applyTheme(theme: ThemeType): void {
  const source = theme === 'light' ? lightThemeColors : charcoalGreyThemeColors;
  for (const key of Object.keys(source) as Array<keyof typeof source>) {
    (writableColors as Record<string, string>)[key as string] = source[key];
  }
}

export const spacing = {
  // Spacing scale - More generous for better aesthetics
  xxs: 2,      // Very minimal spacing
  xs: 6,      // Minimal spacing
  sm: 10,     // Small gaps
  md: 14,     // Medium gaps (default padding)
  lg: 18,     // Large gaps (default padding for cards)
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
    ligth: '100' as const,
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
  // Border radius scale - Generous rounded corners for modern look
  sm: 6,      // Health bars, small elements
  base: 10,   // Buttons, small inputs
  md: 12,     // Input fields
  lg: 14,     // Cards, containers
  xl: 16,     // Large cards (main pattern, matches Browser design)
  '2xl': 20,  // Extra large cards
  full: 9999, // Circular elements
} as const;

export const shadows = {
  // Subtle elevation shadows matching Browser design
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: 'rgba(0, 0, 0, 0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: 'rgba(0, 0, 0, 0.12)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  lg: {
    shadowColor: 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
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
