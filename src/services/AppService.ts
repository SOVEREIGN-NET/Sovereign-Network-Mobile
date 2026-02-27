/**
 * App Service - Generic API calls for wallet and identity data
 */

import { quicRequest } from './quic';
import { maskIdentifier } from '../utils/maskIdentifier';
import type { WalletListResponse } from '../types/wallet';
import type { NodeIdentityResponse } from '../types/identity';

// Re-export for consumers that imported from here
export type { WalletListResponse } from '../types/wallet';
export type { NodeIdentityResponse as IdentityResponse } from '../types/identity';

export interface PoUWRewardsResponse {
  client_did: string;
  total_rewards: number;
  total_earned: number;
  total_paid: number;
  pending: number;
  rewards: Array<{
    reward_id: string;
    epoch: number;
    total_bytes: number;
    raw_amount: number;
    final_amount: number;
    payout_status: 'Paid' | 'Pending' | 'Failed';
    paid_at: number | null;
    tx_hash: string | null;
  }>;
}

export interface PoUWEpochResponse {
  epoch: number;
  total_rewards: number;
  total_earned: number;
  rewards: Array<unknown>;
}

export interface PoUWHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  suspicious_dids: string[];
  suspicious_did_count: number;
}

export interface PoUWChallengeResponse {
  token: string;
  expires_at: number;
}

export interface PoUWSubmitResponse {
  accepted: number;
  rejected: number;
  rewards: Array<{
    client_did: string;
    epoch: number;
    amount: number;
    payout_status: 'pending' | 'Paid' | 'Failed';
  }>;
  reward_calculation?: {
    weighted_count: number;
    raw_amount: number;
    cap_applied: boolean;
    final_amount: number;
  };
}

export interface WalletTransaction {
  tx_hash: string;
  tx_type: string;
  amount: number;
  fee: number;
  from_wallet: string | null;
  to_address: string | null;
  timestamp: number;
  block_height: number | null;
  status: 'confirmed' | 'pending';
  memo: string | null;
}

export interface WalletTransactionsResponse {
  identity_id: string;
  total_transactions: number;
  transactions: WalletTransaction[];
  status?: string;
}

class AppService {
  /**
   * Get wallet list for an identity
   */
  async getWalletList(identityId: string): Promise<WalletListResponse> {
    try {
      const data = await quicRequest<WalletListResponse>(
        `/api/v1/wallet/list/${identityId}`,
        { timeout: 10 },
      );
      console.log('[AppService] getWalletList:', {
        identityId,
        walletCount: data.wallets?.length || 0,
      });
      return data;
    } catch (error: unknown) {
      console.error(
        '[AppService] getWalletList failed:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Get identity information
   */
  async getIdentity(identityId: string): Promise<NodeIdentityResponse> {
    try {
      const data = await quicRequest<NodeIdentityResponse>(
        `/api/v1/identities/${identityId}`,
        { timeout: 10 },
      );
      console.log('[AppService] getIdentity:', {
        identityId: maskIdentifier(identityId),
        did: maskIdentifier(data.did),
      });
      return data;
    } catch (error: unknown) {
      console.error(
        '[AppService] getIdentity failed:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Get PoUW rewards for a client
   */
  async getRewards(clientDid: string): Promise<PoUWRewardsResponse> {
    try {
      const encodedDid = encodeURIComponent(clientDid);
      const data = await quicRequest<PoUWRewardsResponse>(
        `/api/v1/pouw/rewards/${encodedDid}`,
        { timeout: 15 },
      );
      console.log('[AppService] getRewards:', {
        clientDid: maskIdentifier(clientDid),
        totalEarned: data.total_earned,
        totalPaid: data.total_paid,
      });
      return data;
    } catch (error: unknown) {
      console.error(
        '[AppService] getRewards failed:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Get PoUW rewards for a specific epoch
   */
  async getEpochRewards(epoch: number): Promise<PoUWEpochResponse> {
    try {
      const data = await quicRequest<PoUWEpochResponse>(
        `/api/v1/pouw/epochs/${epoch}`,
        { timeout: 15 },
      );
      console.log('[AppService] getEpochRewards:', {
        epoch,
        totalRewards: data.total_rewards,
      });
      return data;
    } catch (error: unknown) {
      console.error(
        '[AppService] getEpochRewards failed:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Get PoUW node health status
   */
  async getPoUWHealth(): Promise<PoUWHealthResponse> {
    try {
      const data = await quicRequest<PoUWHealthResponse>(
        `/api/v1/pouw/health`,
        { timeout: 10 },
      );
      console.log('[AppService] getPoUWHealth:', {
        status: data.status,
        suspiciousCount: data.suspicious_did_count,
      });
      return data;
    } catch (error: unknown) {
      console.error(
        '[AppService] getPoUWHealth failed:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Get a challenge token from the node
   */
  async getChallenge(
    cap?: string,
    maxBytes?: number,
    maxReceipts?: number,
  ): Promise<PoUWChallengeResponse> {
    try {
      const params = new URLSearchParams();
      if (cap) params.set('cap', cap);
      if (maxBytes) params.set('max_bytes', String(maxBytes));
      if (maxReceipts) params.set('max_receipts', String(maxReceipts));

      const query = params.toString();
      const path = `/api/v1/pouw/challenge${query ? `?${query}` : ''}`;

      const data = await quicRequest<PoUWChallengeResponse>(path, {
        timeout: 10,
      });
      console.log('[AppService] getChallenge:', {
        expiresAt: data.expires_at,
      });
      return data;
    } catch (error: unknown) {
      console.error(
        '[AppService] getChallenge failed:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Submit PoUW receipts to the node
   */
  async submitReceipts(
    clientDid: string,
    receipts: Array<{
      receipt: Record<string, unknown>;
      sig_scheme: string;
      signature: string;
    }>,
  ): Promise<PoUWSubmitResponse> {
    try {
      const data = await quicRequest<PoUWSubmitResponse>(
        '/api/v1/pouw/submit',
        {
          method: 'POST',
          timeout: 30,
          body: JSON.stringify({
            version: 1,
            client_did: clientDid,
            receipts,
          }),
        },
      );
      console.log('[AppService] submitReceipts:', {
        accepted: data.accepted,
        rejected: data.rejected,
        rewardsCount: data.rewards?.length || 0,
      });
      return data;
    } catch (error: unknown) {
      console.error(
        '[AppService] submitReceipts failed:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Get wallet transaction history for an identity (64-char hex identity ID).
   */
  async getWalletTransactions(
    identityIdHex: string,
  ): Promise<WalletTransactionsResponse> {
    try {
      const data = await quicRequest<WalletTransactionsResponse>(
        `/api/v1/wallet/transactions/${identityIdHex}`,
        { timeout: 15 },
      );
      console.log('[AppService] getWalletTransactions:', {
        identityId: maskIdentifier(identityIdHex),
        total: data.total_transactions ?? data.transactions?.length ?? 0,
      });
      return data;
    } catch (error: unknown) {
      console.error(
        '[AppService] getWalletTransactions failed:',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}

const appService = new AppService();
export default appService;
