import { useEffect, useState } from 'react';

export interface WalletBalanceData {
  balance: number;
  displayBalance: string;
}

// Configuration - simulated epoch-based wallet balance
const BASE_BALANCE = 500;                // Starting balance
const SOV_PER_EPOCH = 15;                // SOV earned per epoch
const EPOCH_DURATION_MS = 12 * 3600000;  // Epoch = 12 hours in milliseconds
const REFERENCE_DATE = new Date('2025-12-01T00:00:00Z').getTime(); // Reference start date
const UPDATE_INTERVAL_MS = 60000;        // Update every minute

/**
 * Get current wallet balance based on epochs
 */
export const getWalletBalance = (): number => {
  const now = Date.now();
  const epochsSinceReference = Math.floor((now - REFERENCE_DATE) / EPOCH_DURATION_MS);
  return BASE_BALANCE + (epochsSinceReference * SOV_PER_EPOCH);
};

/**
 * Calculates wallet balance based on simulated epochs (12 hours each).
 * Balance = BASE_BALANCE + (epochs since reference date * SOV_PER_EPOCH)
 * Use this hook for consistent balance display across wallet screens.
 */
export const useWalletBalance = (): WalletBalanceData => {
  const [balance, setBalance] = useState(() => getWalletBalance());

  useEffect(() => {
    // Update immediately
    setBalance(getWalletBalance());

    // Then update periodically
    const interval = setInterval(() => {
      setBalance(getWalletBalance());
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Format balance for display (whole number)
  const displayBalance = Math.floor(balance).toString();

  return {
    balance,
    displayBalance,
  };
};
