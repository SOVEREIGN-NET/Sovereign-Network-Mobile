import { useMemo } from 'react';
import { useWalletList } from './useWalletList';

export interface RewardCounterData {
  balance: number;
  displayBalance: string;
  isAccumulating: boolean;
}

/**
 * SOV counter for header bar.
 * Shows the real total balance with XXX.XXX format.
 */
export const useRewardCounter = (): RewardCounterData => {
  const { totalBalance } = useWalletList();
  const displayBalance = useMemo(() => totalBalance.toFixed(3), [totalBalance]);

  return {
    balance: totalBalance,
    displayBalance,
    isAccumulating: false,
  };
};
