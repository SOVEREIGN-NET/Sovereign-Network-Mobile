import { useMemo } from 'react';
import { useApi } from './useApi';
import { useAuth } from './useAuth';
import { useAsyncData } from './useAsyncData';
import { getUseMockService } from '../context/AuthContext';

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

const toWalletDisplay = (wallet: any): WalletDisplay => ({
  id: wallet.wallet_id ?? wallet.id ?? '',
  name: wallet.name ?? `${wallet.wallet_type} Wallet`,
  wallet_type: wallet.wallet_type ?? 'Unknown',
  available_balance: wallet.available_balance ?? 0,
  staked_balance: wallet.staked_balance ?? 0,
  pending_rewards: wallet.pending_rewards ?? 0,
  total_balance: wallet.total_balance ?? wallet.balance ?? 0,
  permissions: wallet.permissions,
  created_at: wallet.created_at,
  description: wallet.description,
});

export const useWalletList = () => {
  const { api, isInitialized } = useApi();
  const { currentIdentity } = useAuth();
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

      if (!api || !isInitialized || !identityId) {
        return null;
      }

      return api.getWalletList(identityId);
    },
    [api, isInitialized, identityId, useMock, currentIdentity?.wallets],
    null,
  );

  const walletData = useMemo<WalletListData>(() => {
    const wallets = (data?.wallets ?? []).map(toWalletDisplay);
    const walletByType = wallets.reduce<Record<string, WalletDisplay>>((acc, wallet) => {
      acc[normalizeWalletType(wallet.wallet_type)] = wallet;
      return acc;
    }, {});

    return {
      identityId: data?.identity_id ?? identityId ?? null,
      totalBalance: data?.total_balance ?? 0,
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
