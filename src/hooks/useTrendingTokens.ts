import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { fetchOraclePrice } from '../services/OracleService';

export interface TokenData {
  symbol: string;
  name: string;
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

        const newPrice = typeof result.value.price === 'number' && result.value.price > 0
          ? result.value.price
          : null;
        if (newPrice === null) return token;
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
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return tokens;
};

export const formatTokenPrice = (price: number): string => {
  if (typeof price !== 'number' || price <= 0) return '—';
  return price < 1 ? `$${price.toFixed(4)}` : `$${price.toFixed(2)}`;
};

export const formatChange = (change: number): string => {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
};
