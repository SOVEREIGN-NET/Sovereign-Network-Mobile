import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useAsyncData } from './useAsyncData';
import { getUseMockService } from '../context/AuthContext';
import appService from '../services/AppService';

const SOV_DECIMALS = 18;
const SOV_ATOMS_PER_UNIT = 10n ** BigInt(SOV_DECIMALS);

/**
 * Parse a raw atoms value (string from node, or legacy number) into a display
 * number expressed in whole SOV. Uses bigint internally so string u128 atoms
 * survive; the final Number() cast is only for UI display of whole-SOV amounts
 * and is safe up to ~9e15 SOV (well beyond the total supply).
 */
const atomsToSov = (v: unknown): number => {
  if (v == null) return 0;
  const s = typeof v === 'number' ? String(Math.trunc(v)) : String(v).trim();
  if (!/^\d+$/.test(s)) return 0;
  const atoms = BigInt(s);
  const whole = atoms / SOV_ATOMS_PER_UNIT;
  const frac = atoms % SOV_ATOMS_PER_UNIT;
  // Combine with float fraction; precision loss only matters below ~1e-15 SOV.
  return Number(whole) + Number(frac) / Number(SOV_ATOMS_PER_UNIT);
};

export interface WalletPermissions {
  can_transfer_external: boolean;
  can_vote: boolean;
  can_stake: boolean;
  can_receive_rewards: boolean;
  daily_transaction_limit: number;
  requires_multisig_threshold: number | null;
}

export interface WalletDisplay {
  id: string;
  name: string;
  wallet_type: string;
  available_balance: number;
  staked_balance: number;
  pending_rewards: number;
  total_balance: number;
  permissions?: WalletPermissions;
  created_at?: number;
  description?: string;
}

export interface WalletListData {
  identityId: string | null;
  totalBalance: number;
  wallets: WalletDisplay[];
  walletByType: Record<string, WalletDisplay>;
}

const normalizeIdentityId = (identityId?: string | null): string | null => {
  if (!identityId) return null;
  const trimmed = identityId.trim();
  if (trimmed.startsWith('did:zhtp:')) {
    return trimmed.substring('did:zhtp:'.length);
  }
  return trimmed;
};

const normalizeWalletType = (walletType: string): string => walletType.toLowerCase();

const resolveWalletId = (wallet: any): string => {
  if (wallet.wallet_id) return wallet.wallet_id;
  if (wallet.id) return wallet.id;
  const summaryId = wallet?.summary?.id?.[0];
  return summaryId ?? '';
};

const toWalletDisplay = (wallet: any): WalletDisplay => ({
  id: resolveWalletId(wallet),
  name: wallet.name ?? `${wallet.wallet_type} Wallet`,
  wallet_type: wallet.wallet_type ?? 'Unknown',
  available_balance: atomsToSov(wallet.available_balance),
  staked_balance: atomsToSov(wallet.staked_balance),
  pending_rewards: atomsToSov(wallet.pending_rewards),
  total_balance: atomsToSov(wallet.total_balance ?? wallet.balance),
  permissions: wallet.permissions,
  created_at: wallet.created_at,
  description: wallet.description,
});

export const useWalletList = () => {
  const { currentIdentity, forceCleanupAndSignOut } = useAuth();
  const identityId = normalizeIdentityId(currentIdentity?.did);
  const useMock = getUseMockService();

  const { data, loading, error, retry } = useAsyncData(
    async () => {
      if (useMock && currentIdentity?.wallets) {
        return {
          identity_id: identityId ?? '',
          total_balance: Object.values(currentIdentity.wallets).reduce(
            (sum: number, wallet: any) => sum + (wallet.balance ?? 0),
            0,
          ),
          wallets: Object.values(currentIdentity.wallets).map(toWalletDisplay),
        };
      }

      try {
        console.log('[useWalletList] 📡 Fetching wallet list for identity:', identityId);
        const response = await appService.getWalletList(identityId);
        console.log('[useWalletList] ✅ Received wallet list response:', {
          identityId: response?.identity_id,
          totalBalance: response?.total_balance,
          walletCount: response?.wallets?.length || 0,
          firstWallet: response?.wallets?.[0],
        });
        return response;
      } catch (err: any) {
        const msg = String(err?.message || err || '').toLowerCase();
        if (msg.includes('invalid dilithium secret key size')) {
          await forceCleanupAndSignOut('invalid_dilithium_key_size');
        }
        console.error('[useWalletList] ❌ Failed to fetch wallet list:', err);
        throw err;
      }
    },
    [identityId, useMock, currentIdentity?.wallets, forceCleanupAndSignOut],
    null,
    !identityId && !useMock,
  );

  const walletData = useMemo<WalletListData>(() => {
    const wallets = (data?.wallets ?? []).map(toWalletDisplay);
    const walletByType = wallets.reduce<Record<string, WalletDisplay>>((acc, wallet) => {
      acc[normalizeWalletType(wallet.wallet_type)] = wallet;
      return acc;
    }, {});
    const totalFromWallets = wallets.reduce((sum, wallet) => sum + (wallet.total_balance ?? 0), 0);
    const totalFromServer = atomsToSov(data?.total_balance);
    const totalBalance = totalFromServer > 0 ? totalFromServer : totalFromWallets;

    return {
      identityId: data?.identity_id ?? identityId ?? null,
      totalBalance,
      wallets,
      walletByType,
    };
  }, [data, identityId]);

  return {
    ...walletData,
    loading,
    error,
    refresh: retry,
  };
};
