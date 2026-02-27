import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import appService, { PoUWRewardsResponse } from '../services/AppService';
import { atomicToHuman } from '../utils/tokenUnits';

const SOV_DECIMALS = 8;

export interface RewardCounterData {
  balance: number;
  displayBalance: string;
  isAccumulating: boolean;
  rewards: PoUWRewardsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const toSOV = (rawAmount: number): number => atomicToHuman(rawAmount, SOV_DECIMALS);

const formatSovBalance = (amount: number): string => {
  if (amount <= 0) return '0';
  if (amount >= 1) return amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  if (amount >= 0.001) return amount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 6 });
  return amount.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
};

/**
 * SOV counter for header bar.
 * Fetches PoUW rewards from backend API.
 */
export const useRewardCounter = (): RewardCounterData => {
  const { currentIdentity } = useAuth();
  const [rewards, setRewards] = useState<PoUWRewardsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRewards = useCallback(async () => {
    if (!currentIdentity?.did) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await appService.getRewards(currentIdentity.did);
      setRewards(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to fetch rewards';
      if (msg.includes('404') || msg.includes('NotFound')) {
        setRewards({
          client_did: currentIdentity.did,
          total_rewards: 0,
          total_earned: 0,
          total_paid: 0,
          pending: 0,
          rewards: [],
        });
        setError(null);
      } else {
        setError(msg);
        console.warn('[useRewardCounter] Error fetching rewards:', msg);
      }
    } finally {
      setLoading(false);
    }
  }, [currentIdentity?.did]);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  const totalEarned = rewards ? toSOV(rewards.total_earned) : 0;
  const displayBalance = formatSovBalance(totalEarned);

  return {
    balance: totalEarned,
    displayBalance,
    isAccumulating: false,
    rewards,
    loading,
    error,
    refetch: fetchRewards,
  };
};
