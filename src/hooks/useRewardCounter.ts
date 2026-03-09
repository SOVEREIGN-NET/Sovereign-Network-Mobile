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
  /** Unix timestamp (seconds) when this identity becomes eligible for PoUW rewards. */
  maturesAt: number | null;
  refetch: () => void;
}

const ZERO_REWARDS = (did: string): PoUWRewardsResponse => ({
  client_did: did,
  total_rewards: 0,
  total_earned: 0,
  total_paid: 0,
  pending: 0,
  rewards: [],
});

/** Extract maturation timing from a QuicError — handles both JSON and plain-text bodies. */
function extractMaturationSecs(error: unknown): { ageSecs: number; requiredSecs: number } | null {
  const body = (error as any)?.body;
  // JSON body: { age_secs, required_secs }
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (typeof obj.age_secs === 'number' && typeof obj.required_secs === 'number') {
      return { ageSecs: obj.age_secs, requiredSecs: obj.required_secs };
    }
  }
  // Plain-text body: "...31164 seconds old, minimum 86400 seconds required"
  const text = typeof body === 'string' ? body : (error instanceof Error ? error.message : '');
  const match = text.match(/(\d+)\s+seconds\s+old.*?minimum\s+(\d+)\s+seconds/i);
  if (match) {
    return { ageSecs: parseInt(match[1], 10), requiredSecs: parseInt(match[2], 10) };
  }
  return null;
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
  const [maturesAt, setMaturesAt] = useState<number | null>(null);

  const fetchRewards = useCallback(async () => {
    if (!currentIdentity?.did) {
      return;
    }

    // Don't hammer the server while we know we're in maturation
    if (maturesAt && Math.floor(Date.now() / 1000) < maturesAt) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await appService.getRewards(currentIdentity.did);
      setRewards(data);
      setMaturesAt(null); // eligible — clear any prior maturation state
    } catch (err) {
      const status = (err as any)?.status as number | undefined;
      const msg = err instanceof Error ? err.message : 'Failed to fetch rewards';

      if (msg.includes('404') || msg.includes('NotFound')) {
        // Identity exists but has no rewards yet — treat as zero
        setRewards(ZERO_REWARDS(currentIdentity.did));
        setError(null);
      } else if (status === 401 || status === 403) {
        // Check whether this is a maturation response (identity too new)
        const info = extractMaturationSecs(err);
        if (__DEV__) {
          console.log('[useRewardCounter] 401 body:', JSON.stringify((err as any)?.body));
        }
        if (info) {
          const remainingSecs = info.requiredSecs - info.ageSecs;
          setMaturesAt(Math.floor(Date.now() / 1000) + remainingSecs);
          setRewards(ZERO_REWARDS(currentIdentity.did));
          setError(null); // not an error — expected during maturation
        } else {
          setError(msg);
          console.warn('[useRewardCounter] Error fetching rewards:', msg);
        }
      } else {
        setError(msg);
        console.warn('[useRewardCounter] Error fetching rewards:', msg);
      }
    } finally {
      setLoading(false);
    }
  }, [currentIdentity?.did, maturesAt]);

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
    maturesAt,
    refetch: fetchRewards,
  };
};
