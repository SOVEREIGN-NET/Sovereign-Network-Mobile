import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

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

interface TokenConfig {
  symbol: string;
  name: string;
  basePrice: number;
  volatility: number;
  trendBias: number;
  showVariation: boolean;
}

const TOKEN_CONFIGS: TokenConfig[] = [
  { symbol: 'SOV', name: 'Sovereign Network Token', basePrice: 0.0218, volatility: 0, trendBias: 0, showVariation: false },
  { symbol: 'CBE', name: 'Central Blockchain Entertainment', basePrice: 5.67, volatility: 0.025, trendBias: 0.4, showVariation: true },
];

const UPDATE_INTERVAL = 2500;

/**
 * Simulates realistic token price variations with momentum-based movement.
 */
export const useTrendingTokens = (): TokenData[] => {
  const animatedRefs = useRef<{ arrowScale: Animated.Value; priceFlash: Animated.Value }[]>(
    TOKEN_CONFIGS.map(() => ({
      arrowScale: new Animated.Value(1),
      priceFlash: new Animated.Value(0),
    }))
  );

  const [tokens, setTokens] = useState<TokenData[]>(() =>
    TOKEN_CONFIGS.map((config, index) => ({
      symbol: config.symbol,
      name: config.name,
      price: config.basePrice,
      previousPrice: config.basePrice,
      change: 0,
      trend: 'neutral' as const,
      showVariation: config.showVariation,
      arrowScale: animatedRefs.current[index].arrowScale,
      priceFlash: animatedRefs.current[index].priceFlash,
    }))
  );

  const momentumRef = useRef<number[]>(TOKEN_CONFIGS.map(() => 0));

  useEffect(() => {
    const interval = setInterval(() => {
      setTokens((prevTokens) =>
        prevTokens.map((token, index) => {
          const config = TOKEN_CONFIGS[index];
          const currentMomentum = momentumRef.current[index];
          const animRefs = animatedRefs.current[index];

          if (!config.showVariation) {
            return {
              ...token,
              previousPrice: config.basePrice,
              price: config.basePrice,
              change: 0,
              trend: 'neutral',
              showVariation: false,
              arrowScale: animRefs.arrowScale,
              priceFlash: animRefs.priceFlash,
            };
          }

          const randomFactor = (Math.random() - 0.5) * 2;
          const biasedRandom = randomFactor + config.trendBias * 0.3;

          const newMomentum = currentMomentum * 0.7 + biasedRandom * 0.3;
          momentumRef.current[index] = newMomentum;

          const priceChange = token.price * config.volatility * newMomentum;
          const newPrice = Math.max(0.01, token.price + priceChange);

          const change = ((newPrice - token.previousPrice) / token.previousPrice) * 100;

          const trend: 'up' | 'down' | 'neutral' =
            Math.abs(change) < 0.01 ? 'neutral' : change > 0 ? 'up' : 'down';

          // Animate arrow with bounce effect
          if (trend !== 'neutral') {
            animRefs.arrowScale.setValue(0.5);
            Animated.spring(animRefs.arrowScale, {
              toValue: 1,
              friction: 3,
              tension: 200,
              useNativeDriver: true,
            }).start();

            // Flash the price change area
            animRefs.priceFlash.setValue(1);
            Animated.timing(animRefs.priceFlash, {
              toValue: 0,
              duration: 800,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }).start();
          }

          return {
            ...token,
            previousPrice: token.price,
            price: newPrice,
            change,
            trend,
            showVariation: config.showVariation,
            arrowScale: animRefs.arrowScale,
            priceFlash: animRefs.priceFlash,
          };
        })
      );
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return tokens;
};

export const formatTokenPrice = (price: number): string => {
  return price < 1 ? `$${price.toFixed(4)}` : `$${price.toFixed(2)}`;
};

export const formatChange = (change: number): string => {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
};
