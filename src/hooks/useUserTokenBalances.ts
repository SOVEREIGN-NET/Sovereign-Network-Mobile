import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useAsyncData } from './useAsyncData';
import { useTokenRegistry } from './useTokenRegistry';
import tokenService from '../services/TokenService';
import { TokenBalanceResponse, TokenListItem } from '../types/token';
import { atomsToDisplayLocale } from '../utils/tokenUnits';

export interface TokenDisplay {
  token_id: string;
  symbol: string;
  name: string;
  /** Null when the node didn't provide decimals — token is in error state. */
  decimals: number | null;
  /** Human-readable balance string, or null if decimals are unknown. */
  balance: string | null;
  /** Raw atomic balance as a decimal string (u128-safe). */
  atomicBalance: string;
  isCreatedByUser?: boolean;
  /** Set when the token cannot be safely displayed (e.g. missing decimals). */
  error?: string;
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

/**
 * Merge the chain-wide token registry with per-address balances.
 *
 * Every token known to the chain produces a display entry; balance is 0 when
 * the address holds none of that token. Caller decides whether to filter
 * (e.g. exclude SOV from the custom-tokens tab).
 */
const mergeRegistryWithBalances = (
  registry: TokenListItem[],
  balances: TokenBalanceResponse[] | null,
): TokenDisplay[] => {
  const balanceMap = new Map<string, TokenBalanceResponse>();
  (balances ?? []).forEach(b => balanceMap.set(b.token_id, b));

  const buildDisplay = (
    token_id: string,
    symbol: string,
    name: string,
    decimalsRaw: number | undefined | null,
    atomicBalance: string,
  ): TokenDisplay => {
    if (decimalsRaw == null || !Number.isFinite(decimalsRaw) || decimalsRaw < 0) {
      console.warn(
        `[useUserTokenBalances] Token ${symbol} (${token_id}) has no decimals — showing in error state`,
      );
      return {
        token_id,
        symbol,
        name,
        decimals: null,
        balance: null,
        atomicBalance,
        error: 'Missing decimals metadata',
      };
    }
    return {
      token_id,
      symbol,
      name,
      decimals: decimalsRaw,
      balance: atomsToDisplayLocale(atomicBalance, decimalsRaw),
      atomicBalance,
    };
  };

  const merged: TokenDisplay[] = registry.map(item => {
    const match = balanceMap.get(item.token_id);
    const atomicBalance = match?.balance ?? '0';
    const decimalsRaw = item.decimals ?? match?.decimals;
    return buildDisplay(item.token_id, item.symbol, item.name, decimalsRaw, atomicBalance);
  });

  // Any token returned by the balances endpoint that isn't in the registry
  // (e.g. registry cache stale, newly-created token) still gets rendered.
  (balances ?? []).forEach(b => {
    if (!registry.some(t => t.token_id === b.token_id)) {
      merged.push(
        buildDisplay(b.token_id, b.symbol, b.name, b.decimals, b.balance ?? '0'),
      );
    }
  });

  return merged;
};

/**
 * Registry-merged token balances for an address.
 *
 * @param address Optional wallet ID or identity ID. Defaults to the current
 *   identity ID when omitted (legacy behavior). Pass `selectedWallet.id`
 *   when you want per-wallet balances.
 */
export const useUserTokenBalances = (address?: string | null) => {
  const { currentIdentity } = useAuth();
  const fallbackId = normalizeIdentityId(currentIdentity?.did);
  // Only fall back to the identity DID when the caller passed nothing
  // (`undefined` — they want the legacy "balances for this identity"
  // behavior). Explicit `null` means "I'm still loading the wallet, do
  // not fetch yet" — distinguishing the two prevents an extra fetch
  // against the identity DID that gets immediately overwritten when
  // the real wallet ID resolves a moment later (SIDScreen pattern).
  const queryAddress = address === undefined ? fallbackId : address;

  const { tokens: registry, loading: registryLoading } = useTokenRegistry();

  const { data: balances, loading: balancesLoading, error, retry } = useAsyncData(
    async () => {
      if (!queryAddress) return [];
      try {
        console.log(
          '[useUserTokenBalances] 📡 Fetching token balances for:',
          queryAddress,
        );
        const result = await tokenService.getUserTokenBalances(queryAddress);
        console.log(
          '[useUserTokenBalances] ✅ Received balances:',
          result.length,
          'tokens',
        );
        return result;
      } catch (err) {
        console.log('[useUserTokenBalances] ⚠️ Failed:', err);
        return [];
      }
    },
    [queryAddress],
    null,
    !queryAddress,
  );

  const tokenData = useMemo<UserTokenBalancesData>(() => {
    const tokens = mergeRegistryWithBalances(registry, balances);
    return {
      tokens,
      totalTokenCount: tokens.length,
      loading: registryLoading || balancesLoading,
      error,
    };
  }, [registry, balances, registryLoading, balancesLoading, error]);

  return {
    ...tokenData,
    refresh: retry,
  };
};
