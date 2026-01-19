import { useMemo } from 'react';
import { useWalletList } from './useWalletList';

export interface WalletBalanceData {
  balance: number;
  displayBalance: string;
  loading: boolean;
  error: Error | null;
}

export const useWalletBalance = (): WalletBalanceData => {
  const { totalBalance, loading, error } = useWalletList();

  const displayBalance = useMemo(
    () => Math.floor(totalBalance).toString(),
    [totalBalance],
  );

  return {
    balance: totalBalance,
    displayBalance,
    loading,
    error,
  };
};
