/**
 * Token registry hook
 *
 * Single source of truth for "what tokens exist on this chain". Fetches from
 * GET /api/v1/token/list and caches at module scope so every caller (balance
 * hooks, send screen, receive screen, domain registration) shares one copy.
 *
 * Do NOT hardcode token IDs anywhere else — resolve via bySymbol() / byId().
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import tokenService from '../services/TokenService';
import type { TokenListItem } from '../types/token';

// Module-level cache: one in-flight fetch and one cached result shared across
// all hook instances. Subscribers get notified on refresh.
let cachedTokens: TokenListItem[] | null = null;
let inflight: Promise<TokenListItem[]> | null = null;
const subscribers = new Set<(tokens: TokenListItem[]) => void>();

async function fetchRegistry(): Promise<TokenListItem[]> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await tokenService.listTokens();
      const tokens = response.tokens ?? [];
      cachedTokens = tokens;
      subscribers.forEach(fn => fn(tokens));
      return tokens;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface TokenRegistry {
  tokens: TokenListItem[];
  bySymbol: (symbol: string) => TokenListItem | undefined;
  byId: (tokenId: string) => TokenListItem | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export const useTokenRegistry = (): TokenRegistry => {
  const [tokens, setTokens] = useState<TokenListItem[]>(cachedTokens ?? []);
  const [loading, setLoading] = useState<boolean>(cachedTokens === null);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchRegistry();
      setTokens(next);
    } catch (err) {
      console.log('[useTokenRegistry] ⚠️ fetch failed:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sub = (next: TokenListItem[]) => setTokens(next);
    subscribers.add(sub);
    if (cachedTokens === null) {
      load();
    } else {
      setTokens(cachedTokens);
      setLoading(false);
    }
    return () => {
      subscribers.delete(sub);
    };
  }, [load]);

  const bySymbol = useCallback(
    (symbol: string) => {
      const target = symbol.toUpperCase();
      return tokens.find(t => (t.symbol || '').toUpperCase() === target);
    },
    [tokens],
  );

  const byId = useCallback(
    (tokenId: string) => tokens.find(t => t.token_id === tokenId),
    [tokens],
  );

  return useMemo(
    () => ({ tokens, bySymbol, byId, loading, error, refresh: load }),
    [tokens, bySymbol, byId, loading, error, load],
  );
};

/**
 * Imperative accessor for non-hook call sites (services).
 * Returns the cached registry or fetches it once.
 */
export async function getTokenRegistry(): Promise<TokenListItem[]> {
  if (cachedTokens) return cachedTokens;
  return fetchRegistry();
}

/** Resolve a token by symbol from the cached registry (fetches if empty). */
export async function resolveTokenBySymbol(
  symbol: string,
): Promise<TokenListItem | undefined> {
  const registry = await getTokenRegistry();
  const target = symbol.toUpperCase();
  return registry.find(t => (t.symbol || '').toUpperCase() === target);
}
