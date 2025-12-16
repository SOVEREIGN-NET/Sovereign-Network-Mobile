import { useEffect, useRef, useState } from 'react';

export interface RewardCounterData {
  balance: number;
  displayBalance: string;
  isAccumulating: boolean;
}

interface RewardCounterConfig {
  targetAmount: number;      // Final amount to reach (e.g., 0.50 SOV)
  durationMs: number;        // Total time to reach target
  tickIntervalMs: number;    // How often to update display
}

const DEFAULT_CONFIG: RewardCounterConfig = {
  targetAmount: 0.50,        // Onboarding faucet amount
  durationMs: 300000,        // 5 minutes to reach full amount
  tickIntervalMs: 3000,      // Update every 3 seconds - very slow drip
};

/**
 * Simulates slowly accumulating SOV tokens as routing rewards
 * Creates a slow "faucet drip" effect for onboarding demo
 */
export const useRewardCounter = (config: Partial<RewardCounterConfig> = {}): RewardCounterData => {
  const { targetAmount, durationMs, tickIntervalMs } = { ...DEFAULT_CONFIG, ...config };

  const [balance, setBalance] = useState(0);
  const [isAccumulating, setIsAccumulating] = useState(true);
  const startTimeRef = useRef(Date.now());

  // Calculate increment per tick
  const totalTicks = durationMs / tickIntervalMs;
  const baseIncrement = targetAmount / totalTicks;

  useEffect(() => {
    if (!isAccumulating) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);

      // Small randomness for organic feel
      const randomFactor = 0.8 + Math.random() * 0.4;
      const increment = baseIncrement * randomFactor;

      setBalance((prev) => {
        const newBalance = prev + increment;

        if (newBalance >= targetAmount || progress >= 1) {
          setIsAccumulating(false);
          return targetAmount;
        }

        return newBalance;
      });
    }, tickIntervalMs);

    return () => clearInterval(interval);
  }, [isAccumulating, baseIncrement, targetAmount, durationMs, tickIntervalMs]);

  // Format balance for display (2 decimal places)
  const displayBalance = balance.toFixed(2);

  return {
    balance,
    displayBalance,
    isAccumulating,
  };
};
