import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useAsyncData } from './useAsyncData';
import { getUseMockService } from '../context/AuthContext';
import appService from '../services/AppService';
import { atomicToHuman } from '../utils/tokenUnits';

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
  available_balance: atomicToHuman(wallet.available_balance ?? 0),
  staked_balance: atomicToHuman(wallet.staked_balance ?? 0),
  pending_rewards: atomicToHuman(wallet.pending_rewards ?? 0),
  total_balance: atomicToHuman(wallet.total_balance ?? wallet.balance ?? 0),
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

      if (!identityId) {
        console.log('[useWalletList] ⚠️ Cannot fetch wallet list: no identity ID');
        return null;
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
  );

  const walletData = useMemo<WalletListData>(() => {
    const wallets = (data?.wallets ?? []).map(toWalletDisplay);
    const walletByType = wallets.reduce<Record<string, WalletDisplay>>((acc, wallet) => {
      acc[normalizeWalletType(wallet.wallet_type)] = wallet;
      return acc;
    }, {});
    const totalFromWallets = wallets.reduce((sum, wallet) => sum + (wallet.total_balance ?? 0), 0);
    const totalBalance =
      data?.total_balance && data.total_balance > 0
        ? atomicToHuman(data.total_balance)
        : totalFromWallets;

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
