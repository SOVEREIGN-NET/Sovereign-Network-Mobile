import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import appService, { PoUWRewardsResponse } from '../services/AppService';

const SOV_DECIMALS = 100_000_000;

export interface RewardCounterData {
  balance: number;
  displayBalance: string;
  isAccumulating: boolean;
  rewards: PoUWRewardsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const toSOV = (rawAmount: number): number => rawAmount / SOV_DECIMALS;

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
  const displayBalance = totalEarned > 0 ? totalEarned.toFixed(3) : '0.000';

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
