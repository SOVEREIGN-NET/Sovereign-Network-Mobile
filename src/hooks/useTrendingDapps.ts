import { useEffect, useRef, useMemo } from 'react';
import { Animated, Easing } from 'react-native';

export interface DappData {
  id: string;
  name: string;
  desc: string;
  url: string;
  change: number;
  activityLevel: 'high' | 'medium' | 'low';
  pulseAnim: Animated.Value;
  glowAnim: Animated.Value;
}

interface DappConfig {
  id: string;
  name: string;
  desc: string;
  url: string;
  baseChange: number;
  volatility: number;
}

const DAPP_CONFIGS: DappConfig[] = [
  { id: 'central', name: 'central.sov', desc: 'CBE applications', url: 'zhtp://central.sov', baseChange: 234, volatility: 0.08 },
  { id: 'sovswap', name: 'sovswap.sov', desc: 'DAO registry - Token Swap', url: 'zhtp://sovswap.sov', baseChange: 189, volatility: 0.12 },
  { id: 'ballot', name: 'ballot.sov', desc: 'Voting Platform', url: 'zhtp://ballot.sov', baseChange: 143, volatility: 0.1 },
];

const UPDATE_INTERVAL = 8000;

const getActivityLevel = (volatility: number, change: number): 'high' | 'medium' | 'low' => {
  const score = volatility * 10 + Math.abs(change) / 50;
  if (score > 1.5) return 'high';
  if (score > 0.8) return 'medium';
  return 'low';
};

/**
 * Returns stable dApp data with animated pulse/glow effects.
 */
export const useTrendingDapps = (): DappData[] => {
  // Initialize animations once. We use useMemo to ensure stability across re-renders
  // but keep the Animated values in a ref-like structure for the animation loops.
  const anims = useMemo(() =>
    DAPP_CONFIGS.map(() => ({
      pulseAnim: new Animated.Value(1),
      glowAnim: new Animated.Value(0),
    })),
  []);

  // Construct the data objects
  const dapps: DappData[] = useMemo(() =>
    DAPP_CONFIGS.map((config, index) => ({
      id: config.id,
      name: config.name,
      desc: config.desc,
      url: config.url,
      change: config.baseChange,
      activityLevel: getActivityLevel(config.volatility, config.baseChange),
      pulseAnim: anims[index].pulseAnim,
      glowAnim: anims[index].glowAnim,
    })),
  [anims]);

  // Continuous pulse animation for activity dots
  useEffect(() => {
    const pulseAnimations = anims.map((refs, index) => {
      const config = DAPP_CONFIGS[index];
      const speed = config.volatility > 0.1 ? 1000 : config.volatility > 0.07 ? 1500 : 2000;

      return Animated.loop(
        Animated.sequence([
          Animated.timing(refs.pulseAnim, {
            toValue: 1.4,
            duration: speed / 2,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(refs.pulseAnim, {
            toValue: 1,
            duration: speed / 2,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    });

    pulseAnimations.forEach((anim) => anim.start());

    return () => {
      pulseAnimations.forEach((anim) => anim.stop());
    };
  }, [anims]);

  // Update glow effects periodically
  useEffect(() => {
    const interval = setInterval(() => {
      DAPP_CONFIGS.forEach((config, index) => {
        const changeFluctuation = (Math.random() - 0.5) * 5;
        const animRefs = anims[index];

        if (Math.abs(changeFluctuation) > 2) {
          animRefs.glowAnim.setValue(1);
          Animated.timing(animRefs.glowAnim, {
            toValue: 0,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
        }
      });
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [anims]);

  return dapps;
};

export const getActivityColor = (level: DappData['activityLevel']): string => {
  switch (level) {
    case 'high':
      return '#51cf66'; // Green - high activity
    case 'medium':
      return '#ffd43b'; // Yellow - medium activity
    case 'low':
      return '#ff6b6b'; // Red - low activity
  }
};
