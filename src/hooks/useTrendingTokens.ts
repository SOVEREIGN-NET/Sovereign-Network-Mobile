import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { fetchOraclePrice } from '../services/OracleService';
import { formatAtomicPriceDisplay } from '../utils/tokenUnits';

export interface TokenData {
  symbol: string;
  name: string;
  /**
   * Price as a decimal string, derived losslessly from `(price_atomic,
   * price_scale)` via BigInt division. NOT a float — two views of the
   * same asset using `priceDisplay` are bit-identical.
   * Empty string means "no price yet".
   */
  priceDisplay: string;
  /** Raw atomic pair kept for downstream math / comparison. */
  priceAtomic: string | null;
  priceScale: string | null;
  /** Float convenience for sign/delta math only. Never for display. */
  price: number;
  previousPrice: number;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  showVariation: boolean;
  arrowScale: Animated.Value;
  priceFlash: Animated.Value;
}

const POLL_INTERVAL_MS = 60_000;

const TOKENS = [
  { symbol: 'SOV', name: 'Sovereign Network Token', pair: 'SOV/USD' as const },
  { symbol: 'CBE', name: 'Central Blockchain Entertainment', pair: 'CBE/USD' as const },
];

export const useTrendingTokens = (): TokenData[] => {
  const animatedRefs = useRef(
    TOKENS.map(() => ({
      arrowScale: new Animated.Value(1),
      priceFlash: new Animated.Value(0),
    })),
  );

  const [tokens, setTokens] = useState<TokenData[]>(() =>
    TOKENS.map((t, i) => ({
      symbol: t.symbol,
      name: t.name,
      priceDisplay: '',
      priceAtomic: null,
      priceScale: null,
      price: 0,
      previousPrice: 0,
      change: 0,
      trend: 'neutral' as const,
      showVariation: false,
      arrowScale: animatedRefs.current[i].arrowScale,
      priceFlash: animatedRefs.current[i].priceFlash,
    })),
  );

  const prevPricesRef = useRef<number[]>(TOKENS.map(() => 0));

  const fetchAll = async () => {
    const results = await Promise.allSettled(
      TOKENS.map(t => fetchOraclePrice(t.pair)),
    );

    setTokens(prev =>
      prev.map((token, i) => {
        const result = results[i];
        if (result.status === 'rejected') return token;

        const resp = result.value;
        const newPrice =
          typeof resp.price === 'number' && resp.price > 0 ? resp.price : null;
        if (newPrice === null) return token;

        // Prefer the atomic pair as the source of truth. `price_scale` field
        // differs by pair (SovPriceResponse uses `oracle_price_scale`).
        const priceAtomic = (resp as any).price_atomic ?? null;
        const priceScale =
          (resp as any).oracle_price_scale ?? (resp as any).price_scale ?? null;
        const priceDisplay =
          priceAtomic && priceScale
            ? formatAtomicPriceDisplay(priceAtomic, priceScale, '$')
            : token.priceDisplay;

        const prevPrice = prevPricesRef.current[i] || newPrice;
        const change = prevPrice > 0
          ? ((newPrice - prevPrice) / prevPrice) * 100
          : 0;
        const trend: TokenData['trend'] =
          Math.abs(change) < 0.0001 ? 'neutral' : change > 0 ? 'up' : 'down';
        const showVariation = prevPrice > 0 && Math.abs(change) >= 0.0001;

        prevPricesRef.current[i] = newPrice;

        const anim = animatedRefs.current[i];
        if (trend !== 'neutral') {
          anim.arrowScale.setValue(0.5);
          Animated.spring(anim.arrowScale, {
            toValue: 1,
            friction: 3,
            tension: 200,
            useNativeDriver: true,
          }).start();

          anim.priceFlash.setValue(1);
          Animated.timing(anim.priceFlash, {
            toValue: 0,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
        }

        return {
          ...token,
          priceDisplay,
          priceAtomic,
          priceScale,
          previousPrice: prevPrice,
          price: newPrice,
          change,
          trend,
          showVariation,
          arrowScale: anim.arrowScale,
          priceFlash: anim.priceFlash,
        };
      }),
    );
  };

  useEffect(() => {
    // Defer first fetch so mount animations aren't blocked by QUIC handshakes.
    const timeout = setTimeout(fetchAll, 500);
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return tokens;
};

/**
 * @deprecated Use `token.priceDisplay` (the pre-computed string from
 *   `formatAtomicPriceDisplay(priceAtomic, priceScale)`) instead. This
 *   float-based formatter drops significant digits past ~15 and is only
 *   kept for callers that haven't migrated yet; new code MUST NOT
 *   introduce new uses.
 */
export const formatTokenPrice = (price: number): string => {
  if (typeof price !== 'number' || price <= 0) return '—';
  if (price >= 1) return `$${price.toFixed(2)}`;
  const leadingZeros = Math.floor(-Math.log10(price));
  return `$${price.toFixed(Math.min(leadingZeros + 4, 10))}`;
};

export const formatChange = (change: number): string => {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
};
