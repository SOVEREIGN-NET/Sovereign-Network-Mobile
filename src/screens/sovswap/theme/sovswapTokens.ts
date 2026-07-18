/**
 * SovSwap design tokens.
 *
 * Editorial register feel — index numbers, kickers, type tags, three
 * semantic accents — but the typography uses the host app's default
 * system font so SovSwap reads as the same product, not a costume
 * change. Numerics use tabular figures so columns line up.
 *
 * Three semantic accents (For-Profit green, Non-Profit rust, Universal
 * blue) carry every status signal — no purple gradients, no glassy
 * panels, no emoji icons.
 */

// All families resolve to the platform system font. We rely on
// `fontVariant: ['tabular-nums']` for monospaced figures rather than
// switching to Menlo / monospace, which would re-introduce a foreign
// face and make numerics jump out of the page.
export const sovswapFonts = {
  display: undefined as string | undefined,
  body: undefined as string | undefined,
  mono: undefined as string | undefined,
} as const;

/**
 * Type scale, in points.
 */
export const sovswapScale = {
  masthead: typography.size['2xl'],    // 20
  section: typography.size.xl,       // 18
  daoTitle: typography.size.lg,      // 16
  body: typography.size.md,          // 14
  bodyLg: typography.size.lg,        // 16
  meta: typography.size.xs,          // 11
  metaSm: typography.size.xs,        // 11
  priceLg: typography.size['4xl'],   // 36
  priceMd: typography.size['2xl'],   // 20
  numeral: typography.size.md,       // 14
  index: typography.size.xs,         // 11
} as const;

/**
 * Letter-spacing presets. Small-caps need positive tracking; running
 * body text wants neutral; display is set tight on purpose.
 */
export const sovswapTracking = {
  display: 0,
  body: 0,
  smallCaps: 0,
  meta: 0,
} as const;

/** Number rendering uses tabular figures so column values align. */
export const sovswapTabular = {
  fontVariant: ['tabular-nums'] as const,
};

// ─── Color Palette ────────────────────────────────────────────────────
//
// Two palettes — light (cream paper) and dark (charcoal). Same shape;
// `applySovSwapTheme` swaps the values on the shared mutable object
// when the host theme toggles. Components reach `sovswapColors.paper`
// etc. through a Proxy stylesheet (`createSovSwapStyles` below) so
// stylesheets rebuild when the palette key changes.

import { colors as appColors, typography } from '../../../theme/tokens';

const lightPalette = {
  // Surface tones — Aligned with App Theme
  paper: appColors.bg_darkest,
  paperWarm: appColors.bg_dark,
  paperEdge: appColors.bg_darker,
  paperInk: appColors.text_primary,
  paperInkSoft: appColors.text_secondary,
  paperInkFaint: appColors.text_tertiary,
  rule: appColors.border,
  ruleSoft: appColors.border_light,
  ruleFaint: appColors.border_light,

  // Semantic accents — also drive +%/−% sign colour.
  forProfit: appColors.success,
  forProfitSoft: `${appColors.success}22`,
  nonProfit: appColors.info,
  nonProfitSoft: `${appColors.info}22`,
  universal: appColors.info,
  universalSoft: `${appColors.info}22`,

  up: appColors.success,
  down: appColors.error,
  flat: appColors.text_secondary,

  field: appColors.bg_darker,
  fieldFocus: appColors.bg_medium,
};

const darkPalette: typeof lightPalette = {
  // Surface tones — Aligned with App Theme (Dark/Charcoal)
  paper: appColors.bg_darkest,
  paperWarm: appColors.bg_dark,
  paperEdge: appColors.bg_darker,
  paperInk: appColors.text_primary,
  paperInkSoft: appColors.text_secondary,
  paperInkFaint: appColors.text_tertiary,
  rule: appColors.border,
  ruleSoft: appColors.border_light,
  ruleFaint: appColors.border_light,

  // Semantic accents
  forProfit: appColors.success,
  forProfitSoft: `${appColors.success}22`,
  nonProfit: appColors.info,
  nonProfitSoft: `${appColors.info}22`,
  universal: appColors.info,
  universalSoft: `${appColors.info}22`,

  up: appColors.success,
  down: appColors.error,
  flat: appColors.text_secondary,

  field: appColors.bg_darker,
  fieldFocus: appColors.bg_medium,
};

/**
 * Live-mutable colour palette. `applySovSwapTheme` rewrites these
 * values in place; the Proxy returned by `createSovSwapStyles` watches
 * `paper` as a sentinel and rebuilds its stylesheet whenever it
 * changes, so consumers don't need to thread theme through render.
 */
const writableSovColors: { [K in keyof typeof lightPalette]: string } = {
  ...lightPalette,
};
export const sovswapColors = writableSovColors as typeof lightPalette;

export type SovSwapTheme = 'light' | 'charcoal';

export function applySovSwapTheme(theme: SovSwapTheme): void {
  const src = theme === 'charcoal' ? darkPalette : lightPalette;
  for (const k of Object.keys(src) as Array<keyof typeof src>) {
    (writableSovColors as Record<string, string>)[k as string] = src[k];
  }
}

export type SovOrgType = 'for-profit' | 'non-profit' | 'universal';

/**
 * Look up the accent + soft-fill pair for a given org type. Used by
 * pills, charts, CTA buttons, type tags everywhere in SovSwap.
 */
export const sovswapAccentFor = (
  type: SovOrgType,
): { accent: string; soft: string; label: string } => {
  if (type === 'for-profit') {
    return {
      accent: sovswapColors.forProfit,
      soft: sovswapColors.forProfitSoft,
      label: 'FOR-PROFIT',
    };
  }
  if (type === 'non-profit') {
    return {
      accent: sovswapColors.nonProfit,
      soft: sovswapColors.nonProfitSoft,
      label: 'NON-PROFIT',
    };
  }
  return {
    accent: sovswapColors.universal,
    soft: sovswapColors.universalSoft,
    label: 'UNIVERSAL',
  };
};

// ─── Layout primitives ────────────────────────────────────────────────

export const sovswapSpacing = {
  hair: 1,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Composed text style presets. Pulled out so screens read declaratively
 * and the design language stays consistent — change a preset, ripple
 * through every surface that uses it.
 */
/**
 * Type presets — defined as getters so each access reads the current
 * `sovswapColors` palette. That way when the theme flips, code paths
 * that spread `...sovswapType.body` pick up the new colour without
 * needing to thread theme through render.
 */
export const sovswapType = {
  get masthead() {
    return {
      fontSize: typography.size['2xl'],
      color: appColors.text_primary,
      fontWeight: typography.weight.bold,
    };
  },
  get sectionTitle() {
    return {
      fontSize: typography.size.xl,
      color: appColors.text_primary,
      fontWeight: typography.weight.bold,
    };
  },
  get daoTitle() {
    return {
      fontSize: typography.size.lg,
      color: appColors.text_primary,
      fontWeight: typography.weight.semibold,
    };
  },
  get body() {
    return {
      fontSize: typography.size.md,
      color: appColors.text_primary,
      lineHeight: typography.lineHeight.normal,
    };
  },
  get bodySoft() {
    return {
      fontSize: typography.size.md,
      color: appColors.text_secondary,
      lineHeight: typography.lineHeight.normal,
    };
  },
  get smallCaps() {
    return {
      fontSize: typography.size.xs,
      color: appColors.text_tertiary,
      fontWeight: typography.weight.semibold,
      textTransform: 'uppercase' as const,
      letterSpacing: 0,
    };
  },
  get smallCapsInk() {
    return {
      fontSize: typography.size.xs,
      color: appColors.text_primary,
      fontWeight: typography.weight.semibold,
      textTransform: 'uppercase' as const,
      letterSpacing: 0,
    };
  },
  get index() {
    return {
      fontSize: typography.size.xs,
      color: appColors.text_tertiary,
      fontWeight: typography.weight.semibold,
    };
  },
  get numeral() {
    return {
      fontSize: typography.size.md,
      color: appColors.text_primary,
    };
  },
  get numeralSoft() {
    return {
      fontSize: typography.size.md,
      color: appColors.text_secondary,
    };
  },
  get priceLg() {
    return {
      fontSize: typography.size['4xl'],
      color: appColors.text_primary,
      fontWeight: typography.weight.bold,
    };
  },
  get priceMd() {
    return {
      fontSize: typography.size['2xl'],
      color: appColors.text_primary,
      fontWeight: typography.weight.semibold,
    };
  },
};

/**
 * Proxy stylesheet wrapper. Builds the stylesheet lazily and rebuilds
 * whenever the theme palette flips (detected via the `paper` sentinel).
 * Use exactly like `StyleSheet.create`:
 *
 *     const styles = createSovSwapStyles(() => StyleSheet.create({ ... }));
 *
 * The Proxy returns the same shape as the underlying StyleSheet, so
 * call sites stay unchanged. Mirrors `createThemeReactiveStyles` in
 * `src/theme/themeReactiveStyles.ts`.
 */
export function createSovSwapStyles<S extends object>(
  makeStyles: () => S,
): S {
  let cached: S | null = null;
  let key: string | null = null;
  return new Proxy({} as S, {
    get(_t, prop: string) {
      if (cached === null || key !== sovswapColors.paper) {
        cached = makeStyles();
        key = sovswapColors.paper;
      }
      return (cached as Record<string, unknown>)[prop];
    },
  });
}

