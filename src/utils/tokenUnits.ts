const SOV_DECIMALS = 18;

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
