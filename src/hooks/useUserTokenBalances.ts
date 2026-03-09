import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useAsyncData } from './useAsyncData';
import tokenService from '../services/TokenService';
import { TokenBalanceResponse } from '../types/token';
import { atomicToHuman } from '../utils/tokenUnits';

export interface TokenDisplay {
  token_id: string;
  symbol: string;
  balance: number;
  name?: string;
  decimals?: number;
  isCreatedByUser?: boolean;
}

export interface UserTokenBalancesData {
  tokens: TokenDisplay[];
  totalTokenCount: number;
  loading: boolean;
  error: Error | null;
}

const normalizeIdentityId = (identityId?: string | null): string | null => {
  if (!identityId) return null;
  const trimmed = identityId.trim();
  if (trimmed.startsWith('did:zhtp:')) {
    return trimmed.substring('did:zhtp:'.length);
  }
  return trimmed;
};

const toTokenDisplay = (balance: TokenBalanceResponse): TokenDisplay => ({
  token_id: balance.token_id,
  symbol: balance.symbol,
  balance: atomicToHuman(balance.balance, balance.decimals),
  name: balance.name,
  decimals: balance.decimals,
});

export const useUserTokenBalances = () => {
  const { currentIdentity } = useAuth();
  const identityId = normalizeIdentityId(currentIdentity?.did);

  const { data, loading, error, retry } = useAsyncData(
    async () => {
      try {
        console.log('[useUserTokenBalances] 📡 Fetching token balances for identity:', identityId);
        const balances = await tokenService.getUserTokenBalances(identityId);
        console.log('[useUserTokenBalances] ✅ Received token balances:', balances.length, 'tokens');
        return balances;
      } catch (err) {
        console.log('[useUserTokenBalances] ⚠️ Failed to fetch token balances:', err);
        return [];
      }
    },
    [identityId],
    null,
    !identityId,
  );

  const tokenData = useMemo<UserTokenBalancesData>(() => {
    const tokens = (data ?? []).map(toTokenDisplay);

    return {
      tokens,
      totalTokenCount: tokens.length,
      loading,
      error,
    };
  }, [data, loading, error]);

  return {
    ...tokenData,
    refresh: retry,
  };
};
