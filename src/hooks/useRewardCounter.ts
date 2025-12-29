import { useEffect, useState, useRef } from 'react';
import { getWalletBalance } from './useWalletBalance';

export interface RewardCounterData {
  balance: number;
  displayBalance: string;
  isAccumulating: boolean;
}

const UPDATE_INTERVAL_MS = 3000; // Update every 3 seconds
const INCREMENT_PER_TICK = 0.001; // Small increment per tick

/**
 * Get header balance (1/5 of wallet balance)
 */
const getHeaderBalance = (): number => {
  return getWalletBalance() / 5;
};

const START_BALANCE = 25000;  // Start with 25k SOV

/**
 * SOV counter for header bar.
 * Shows 1/5 of the wallet balance with XXX.XXX format.
 * Decimals increment smoothly for visual movement.
 */
export const useRewardCounter = (): RewardCounterData => {
  const baseBalance = useRef(getHeaderBalance());
  const [balance, setBalance] = useState(() => baseBalance.current);
  const [isAccumulating] = useState(true);

  useEffect(() => {
    // Sync base balance periodically (every minute)
    const syncInterval = setInterval(() => {
      baseBalance.current = getHeaderBalance();
    }, 60000);

    // Increment decimals for visual movement
    const tickInterval = setInterval(() => {
      setBalance((prev) => prev + INCREMENT_PER_TICK);
    }, UPDATE_INTERVAL_MS);

    return () => {
      clearInterval(syncInterval);
      clearInterval(tickInterval);
    };
  }, []);

  // Format balance for display: XXX.XXX
  const displayBalance = balance.toFixed(3);

  return {
    balance,
    displayBalance,
    isAccumulating,
  };
};
