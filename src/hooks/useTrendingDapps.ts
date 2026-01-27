import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

export interface DappData {
  id: string;
  name: string;
  desc: string;
  url: string;
  activeUsers: number;
  change: number;
  activityLevel: 'high' | 'medium' | 'low';
  pulseAnim: Animated.Value;
  userCountAnim: Animated.Value;
  glowAnim: Animated.Value;
}

interface DappConfig {
  id: string;
  name: string;
  desc: string;
  url: string;
  baseUsers: number;
  volatility: number;
  baseChange: number;
}

const DAPP_CONFIGS: DappConfig[] = [
  { id: 'central', name: 'Central.sov', desc: 'CBE applications', url: 'zhtp://central.sov', baseUsers: 342, volatility: 0.08, baseChange: 234 },
  { id: 'sovswap', name: 'SovSwap', desc: 'DAO registry - Token Swap', url: 'zhtp://sovswap.sov', baseUsers: 287, volatility: 0.12, baseChange: 189 },
  { id: 'breakroom', name: 'Breakroom', desc: 'Employee management', url: 'zhtp://breakroom.sov', baseUsers: 156, volatility: 0.06, baseChange: 156 },
  { id: 'ballot', name: 'Ballot', desc: 'Voting Platform', url: 'zhtp://ballot.sov', baseUsers: 89, volatility: 0.1, baseChange: 143 },
];

const UPDATE_INTERVAL = 8000;
const PULSE_DURATION = 1500;

const getActivityLevel = (volatility: number, change: number): 'high' | 'medium' | 'low' => {
  const score = volatility * 10 + Math.abs(change) / 50;
  if (score > 1.5) return 'high';
  if (score > 0.8) return 'medium';
  return 'low';
};

/**
 * Simulates dApp activity with user counts and engagement metrics
 */
export const useTrendingDapps = (): DappData[] => {
  const animatedRefs = useRef<{
    pulseAnim: Animated.Value;
    userCountAnim: Animated.Value;
    glowAnim: Animated.Value;
  }[]>(
    DAPP_CONFIGS.map(() => ({
      pulseAnim: new Animated.Value(1),
      userCountAnim: new Animated.Value(0),
      glowAnim: new Animated.Value(0),
    }))
  );

  const [dapps, setDapps] = useState<DappData[]>(() =>
    DAPP_CONFIGS.map((config, index) => ({
      id: config.id,
      name: config.name,
      desc: config.desc,
      url: config.url,
      activeUsers: config.baseUsers,
      change: config.baseChange,
      activityLevel: getActivityLevel(config.volatility, config.baseChange),
      pulseAnim: animatedRefs.current[index].pulseAnim,
      userCountAnim: animatedRefs.current[index].userCountAnim,
      glowAnim: animatedRefs.current[index].glowAnim,
    }))
  );

  // Continuous pulse animation for activity dots
  useEffect(() => {
    const pulseAnimations = animatedRefs.current.map((refs, index) => {
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
  }, []);

  // Update user counts periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setDapps((prevDapps) =>
        prevDapps.map((dapp, index) => {
          const config = DAPP_CONFIGS[index];
          const animRefs = animatedRefs.current[index];

          // Random user fluctuation
          const userChange = Math.floor(
            (Math.random() - 0.4) * config.baseUsers * config.volatility
          );
          const newUsers = Math.max(10, dapp.activeUsers + userChange);

          // Slight change in growth percentage
          const changeFluctuation = (Math.random() - 0.5) * 5;
          const newChange = Math.max(0, config.baseChange + changeFluctuation);

          // Animate user count change
          if (userChange !== 0) {
            animRefs.userCountAnim.setValue(userChange > 0 ? -1 : 1);
            Animated.spring(animRefs.userCountAnim, {
              toValue: 0,
              friction: 5,
              tension: 100,
              useNativeDriver: true,
            }).start();

            // Glow effect on significant changes
            if (Math.abs(userChange) > config.baseUsers * 0.03) {
              animRefs.glowAnim.setValue(1);
              Animated.timing(animRefs.glowAnim, {
                toValue: 0,
                duration: 600,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
              }).start();
            }
          }

          return {
            ...dapp,
            activeUsers: newUsers,
            change: Math.round(newChange),
            activityLevel: getActivityLevel(config.volatility, newChange),
          };
        })
      );
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return dapps;
};

export const formatUserCount = (count: number): string => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
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
