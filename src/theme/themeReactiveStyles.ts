/**
 * createThemeReactiveStyles
 *
 * Builds a Proxy around a lazy stylesheet factory so the sheet is rebuilt
 * whenever the active theme changes. Used at module scope in place of
 * `StyleSheet.create(...)` — the component body keeps using `styles.foo`
 * as if the sheet were static.
 *
 * Why: `StyleSheet.create` snapshots `colors.x` at import time. The app's
 * theme mutates `colors` in place (see `applyTheme` in `theme/tokens`), so
 * a module-scope StyleSheet would lock in the dark palette forever —
 * "cards stay black in light mode". This helper re-reads `colors.bg_darkest`
 * on every access and rebuilds when it changes.
 *
 * Replaces the ~15-line Proxy boilerplate that was copy-pasted across
 * every explorer / oracle / modal screen.
 */

import { colors } from './tokens';

export function createThemeReactiveStyles<S extends object>(
  makeStyles: () => S,
): S {
  let cached: S | null = null;
  let key: string | null = null;
  return new Proxy({} as S, {
    get(_t, prop: string) {
      if (cached === null || key !== colors.bg_darkest) {
        cached = makeStyles();
        key = colors.bg_darkest;
      }
      return (cached as unknown as Record<string, unknown>)[prop];
    },
  });
}
