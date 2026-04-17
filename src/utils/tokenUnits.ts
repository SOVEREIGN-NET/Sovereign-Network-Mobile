/**
 * Default decimals for the native SOV token.
 *
 * Exported so callers that legitimately fall back (e.g. rendering a row that
 * came from an endpoint which doesn't tag each tx with its token's decimals)
 * can reference the same constant instead of re-hardcoding `18` in their file.
 * Prefer reading decimals from the transaction / token metadata when the
 * backend provides it — this is the last-resort default only.
 */
export const SOV_DECIMALS = 18;

/** @deprecated Lossy — relies on JS number. Use {@link atomsToDisplay} / {@link atomsToBigInt}. */
export function atomicToHuman(atomic: number, decimals: number = SOV_DECIMALS): number {
  return atomic / Math.pow(10, decimals);
}

/** Human-readable string → atomic units string (e.g. "10" → "1000000000"). Returns null on invalid input. */
export function humanToAtomic(amountStr: string, decimals: number = SOV_DECIMALS): string | null {
  const normalized = amountStr.trim();
  if (!normalized) return null;
  const [whole, frac = ''] = normalized.split('.');
  if (!/^\d+$/.test(whole) || (frac && !/^\d+$/.test(frac))) return null;
  if (frac.length > decimals) return null;
  const paddedFrac = frac.padEnd(decimals, '0');
  const combined = `${whole}${paddedFrac}`.replace(/^0+/, '') || '0';
  return combined;
}

/** @deprecated Lossy — uses atomicToHuman. Use {@link atomsToDisplay}. */
export function formatAtomicBalance(
  atomic: number,
  decimals: number = SOV_DECIMALS,
  displayDecimals: number = 2,
): string {
  const human = atomicToHuman(atomic, decimals);
  return human.toLocaleString('en-US', {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  });
}

// ---- bigint-safe path (18-decimal migration) ------------------------------

/** Parse a decimal atoms string to bigint. Throws on invalid input. */
export function atomsToBigInt(atoms: string): bigint {
  if (!/^\d+$/.test(atoms)) {
    throw new Error(`atomsToBigInt: invalid atoms string "${atoms}"`);
  }
  return BigInt(atoms);
}

/**
 * Format an atoms string for display with a given token decimals.
 *
 * Pure string/bigint math — no precision loss even for u128 values. Output is
 * trimmed of trailing zeros and keeps at most `fractionDigits` fractional digits
 * (truncated, not rounded).
 *
 * Examples (decimals=18):
 *   "5000000000000000000000" → "5000"
 *   "1234567890000000000"    → "1.2345"
 *   "0"                      → "0"
 */
export function atomsToDisplay(
  atoms: string,
  decimals: number,
  fractionDigits: number = 4,
): string {
  if (!/^\d+$/.test(atoms)) return '0';
  if (decimals <= 0) return atoms;

  const padded = atoms.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals);

  const wholeTrimmed = whole.replace(/^0+/, '') || '0';
  if (fractionDigits <= 0) return wholeTrimmed;

  const fracTrimmed = frac.slice(0, fractionDigits).replace(/0+$/, '');
  return fracTrimmed ? `${wholeTrimmed}.${fracTrimmed}` : wholeTrimmed;
}

/**
 * Convert atoms to a JS number representing whole tokens.
 *
 * Precision-safe for reasonable balances: the bigint→number cast only loses
 * precision below ~1e-15 whole tokens, well below any display or comparison
 * threshold. Use this when legacy code requires `number` (e.g. arithmetic,
 * `sum + balance` reductions). Prefer {@link atomsToDisplay} for UI text.
 */
export function atomsToNumber(atoms: string, decimals: number): number {
  if (!/^\d+$/.test(atoms)) return 0;
  if (decimals <= 0) return Number(BigInt(atoms));
  const divisor = 10n ** BigInt(decimals);
  const big = BigInt(atoms);
  const whole = big / divisor;
  const frac = big % divisor;
  return Number(whole) + Number(frac) / Number(divisor);
}

// ---- Exact price formatting (no float, no trimming) ----------------------
//
// Oracle prices arrive from the node as a (`price_atomic`, `price_scale`)
// pair of decimal strings. The convenience `price: number` field on the
// response is lossy — it's a JS double pre-computed server-side and
// rounds below ~15 significant digits. Every view that displays a price
// MUST derive the string from the atomic pair via `formatAtomicPrice` so
// two views of the same asset render bit-identical characters.
//
// Concretely: for `price_atomic = "12345"`, `price_scale = "100000"`
// we return `"0.12345"` — all digits, no rounding, no `toFixed` cut-off.
// Callers decide how to lay out long strings (dynamic font size,
// wrapping, etc.) but NEVER drop digits to fit.

/**
 * Options for {@link formatAtomicPrice}.
 *
 * The defaults (`minFractionDigits: 8`, `maxFractionDigits: 18`) are
 * tuned for the app's price surfaces: every price rendered anywhere in
 * the app shows **at least** 8 decimals so that SOV ($0.00003400) and
 * CBE ($0.00012300) line up with identical label widths, and UP TO 18
 * decimals when the underlying atoms carry more precision (so we never
 * silently drop significant digits to make layout "fit").
 */
export interface FormatAtomicPriceOptions {
  /** Minimum digits shown after the decimal point. Padded with `0`s. */
  minFractionDigits?: number;
  /** Absolute cap on digits shown after the decimal point. */
  maxFractionDigits?: number;
}

const PRICE_DEFAULT_MIN_FRAC = 8;
const PRICE_DEFAULT_MAX_FRAC = 18;

/**
 * Divide `numStr / denomStr` and render the result as a decimal string
 * with no precision loss. Both inputs are non-negative integer decimal
 * strings (atoms). The denominator is always one of the oracle `*_scale`
 * fields — in practice a power of ten, but this implementation handles
 * any positive integer denominator via long division.
 *
 * The fractional part is zero-padded to `minFractionDigits` and trimmed
 * at `maxFractionDigits`. Trailing non-significant zeros *beyond* the
 * minimum are preserved so labels across the app line up pixel-for-pixel.
 *
 * Returns `"0"` for any malformed input (callers should show `—` upstream).
 */
export function formatAtomicPrice(
  numStr: string | null | undefined,
  denomStr: string | null | undefined,
  opts?: FormatAtomicPriceOptions,
): string {
  const minFrac = opts?.minFractionDigits ?? PRICE_DEFAULT_MIN_FRAC;
  const maxFrac = Math.max(minFrac, opts?.maxFractionDigits ?? PRICE_DEFAULT_MAX_FRAC);

  if (!numStr || !denomStr) return padZero('0', minFrac);
  const n = numStr.trim();
  const d = denomStr.trim();
  if (!/^\d+$/.test(n) || !/^\d+$/.test(d)) return padZero('0', minFrac);
  const denom = BigInt(d);
  if (denom === 0n) return padZero('0', minFrac);
  const num = BigInt(n);

  const whole = num / denom;
  let remainder = num % denom;

  // Long-divide the fractional part up to `maxFrac` digits.
  let frac = '';
  for (let i = 0; i < maxFrac && remainder !== 0n; i++) {
    remainder *= 10n;
    const digit = remainder / denom;
    frac += digit.toString();
    remainder = remainder % denom;
  }

  // Pad up to the min, but do NOT trim below it. We only trim zeros past
  // the minimum, and only if maxFrac permits — the whole point of
  // minFractionDigits is that $0.00003400 and $0.12340000 have the same
  // number of characters in the fractional part.
  if (frac.length < minFrac) {
    frac = frac.padEnd(minFrac, '0');
  } else if (frac.length > minFrac) {
    // Strip trailing zeros beyond the minimum.
    frac = frac.replace(/0+$/, '');
    if (frac.length < minFrac) frac = frac.padEnd(minFrac, '0');
  }

  return `${whole.toString()}.${frac}`;
}

function padZero(whole: string, minFrac: number): string {
  if (minFrac <= 0) return whole;
  return `${whole}.${'0'.repeat(minFrac)}`;
}

/**
 * Same as {@link formatAtomicPrice}, but prefixed with a currency symbol
 * and with thousands separators on the integer part.
 */
export function formatAtomicPriceDisplay(
  numStr: string | null | undefined,
  denomStr: string | null | undefined,
  currencyPrefix: string = '$',
  opts?: FormatAtomicPriceOptions,
): string {
  const plain = formatAtomicPrice(numStr, denomStr, opts);
  const [whole, frac] = plain.split('.');
  const wholeWithSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac
    ? `${currencyPrefix}${wholeWithSep}.${frac}`
    : `${currencyPrefix}${wholeWithSep}`;
}

// ---- FFI transport: amounts as u128 strings -------------------------------
//
// The native signing bridges (iOS Swift + Android JNI) parse amounts as
// decimal strings and split them into two u64 halves (lo, hi) at the final
// FFI boundary. JS code MUST NOT convert atoms strings to JS `Number` —
// 1000 SOV at 18 decimals = 1e21 atoms, which exceeds the u64 range and
// loses precision as a double. This one-liner is the single valid way to
// prepare a bigint-derived atoms string for bridge calls.

/**
 * Sanity-check that a string is a valid u128 atoms value ("0" or digits
 * only, no negative, no fraction, ≤ 2^128-1). Returns the trimmed string,
 * or throws. Use this at the boundary before every native bridge call so
 * the native side never has to second-guess what it received.
 */
export const U128_MAX = (1n << 128n) - 1n;

export function validateAtomsString(atoms: string): string {
  const s = atoms.trim();
  if (!/^\d+$/.test(s)) {
    throw new Error(`validateAtomsString: not a non-negative integer: "${atoms}"`);
  }
  if (BigInt(s) > U128_MAX) {
    throw new Error(`validateAtomsString: exceeds u128 max: "${atoms}"`);
  }
  return s;
}

/** Format with thousands separators on the integer part. */
export function atomsToDisplayLocale(
  atoms: string,
  decimals: number,
  fractionDigits: number = 4,
): string {
  const plain = atomsToDisplay(atoms, decimals, fractionDigits);
  const [whole, frac] = plain.split('.');
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${withSep}.${frac}` : withSep;
}
