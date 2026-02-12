const SOV_DECIMALS = 8;

/** Atomic units → human-readable number (e.g. 500000000000 → 5000) */
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

/** Format atomic units for display with locale separators (e.g. 500000000000 → "5,000.00") */
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
