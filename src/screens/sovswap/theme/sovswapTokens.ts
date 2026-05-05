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
  masthead: 30,    // top-of-page H1
  section: 22,     // section headers
  daoTitle: 20,    // entry name on a card
  body: 14,
  bodyLg: 16,
  meta: 11,
  metaSm: 10,
  priceLg: 36,     // hero price
  priceMd: 22,     // card price
  numeral: 14,     // inline numeric
  index: 11,       // entry index №001
} as const;

/**
 * Letter-spacing presets. Small-caps need positive tracking; running
 * body text wants neutral; display is set tight on purpose.
 */
export const sovswapTracking = {
  display: -0.3,
  body: 0,
  smallCaps: 1.2,
  meta: 0.6,
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

const lightPalette = {
  // Surface tones — warm cream paper
  paper: '#F4EFE6',
  paperWarm: '#EDE6D6',
  paperEdge: '#DED5BF',
  paperInk: '#1A1614',
  paperInkSoft: '#5C544B',
  paperInkFaint: '#8A8276',
  rule: '#1A1614',
  ruleSoft: 'rgba(26, 22, 20, 0.18)',
  ruleFaint: 'rgba(26, 22, 20, 0.08)',

  // Semantic accents — also drive +%/−% sign colour.
  forProfit: '#1F4D3A',
  forProfitSoft: '#E1EAE3',
  nonProfit: '#A23E2A',
  nonProfitSoft: '#F0DED7',
  universal: '#1B3A6B',
  universalSoft: '#DCE2EC',

  up: '#1F4D3A',
  down: '#A23E2A',
  flat: '#5C544B',

  field: '#EDE6D6',
  fieldFocus: '#E5DCC7',
};

const darkPalette: typeof lightPalette = {
  // Surface tones — flipped: ink is now light, paper is now dark.
  // The ink reads as warm cream against the charcoal so the page
  // feels like the same publication printed on dark stock, not a
  // generic "dark mode".
  paper: '#1A1614',
  paperWarm: '#252220',
  paperEdge: '#332E2A',
  paperInk: '#F4EFE6',
  paperInkSoft: '#B5ADA0',
  paperInkFaint: '#7A726A',
  rule: '#F4EFE6',
  ruleSoft: 'rgba(244, 239, 230, 0.16)',
  ruleFaint: 'rgba(244, 239, 230, 0.08)',

  // Brighter semantic accents so they stay legible on charcoal.
  forProfit: '#3FA86F',
  forProfitSoft: 'rgba(63, 168, 111, 0.16)',
  nonProfit: '#E07560',
  nonProfitSoft: 'rgba(224, 117, 96, 0.16)',
  universal: '#5A8DD8',
  universalSoft: 'rgba(90, 141, 216, 0.16)',

  up: '#3FA86F',
  down: '#E07560',
  flat: '#B5ADA0',

  field: '#252220',
  fieldFocus: '#332E2A',
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
      fontSize: sovswapScale.masthead,
      color: sovswapColors.paperInk,
      letterSpacing: sovswapTracking.display,
      fontWeight: '700' as const,
    };
  },
  get sectionTitle() {
    return {
      fontSize: sovswapScale.section,
      color: sovswapColors.paperInk,
      letterSpacing: sovswapTracking.display,
      fontWeight: '700' as const,
    };
  },
  get daoTitle() {
    return {
      fontSize: sovswapScale.daoTitle,
      color: sovswapColors.paperInk,
      letterSpacing: sovswapTracking.display,
      fontWeight: '600' as const,
    };
  },
  get body() {
    return {
      fontSize: sovswapScale.body,
      color: sovswapColors.paperInk,
      letterSpacing: sovswapTracking.body,
      lineHeight: 20,
    };
  },
  get bodySoft() {
    return {
      fontSize: sovswapScale.body,
      color: sovswapColors.paperInkSoft,
      letterSpacing: sovswapTracking.body,
      lineHeight: 20,
    };
  },
  get smallCaps() {
    return {
      fontSize: sovswapScale.meta,
      color: sovswapColors.paperInkSoft,
      letterSpacing: sovswapTracking.smallCaps,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
    };
  },
  get smallCapsInk() {
    return {
      fontSize: sovswapScale.meta,
      color: sovswapColors.paperInk,
      letterSpacing: sovswapTracking.smallCaps,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
    };
  },
  get index() {
    return {
      fontSize: sovswapScale.index,
      color: sovswapColors.paperInkSoft,
      letterSpacing: 0.5,
      fontWeight: '600' as const,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    };
  },
  get numeral() {
    return {
      fontSize: sovswapScale.numeral,
      color: sovswapColors.paperInk,
      letterSpacing: 0,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    };
  },
  get numeralSoft() {
    return {
      fontSize: sovswapScale.numeral,
      color: sovswapColors.paperInkSoft,
      letterSpacing: 0,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    };
  },
  get priceLg() {
    return {
      fontSize: sovswapScale.priceLg,
      color: sovswapColors.paperInk,
      letterSpacing: -0.5,
      fontWeight: '600' as const,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    };
  },
  get priceMd() {
    return {
      fontSize: sovswapScale.priceMd,
      color: sovswapColors.paperInk,
      letterSpacing: 0,
      fontWeight: '600' as const,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
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

