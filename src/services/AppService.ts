/**
 * App Service - Generic API calls for wallet and identity data
 * Replaces api-client dependency for non-auth endpoints
 */

import { quicRequest, toQuicUrl } from './QuicClient';
import { DEFAULT_SOV_NODE_URL } from '../config';
import SecureIdentityStorage from './SecureIdentityStorage';

export interface WalletListResponse {
  identity_id: string;
  total_balance: number;
  wallets: Array<{
    wallet_id?: string;
    id?: string;
    name?: string;
    wallet_type: string;
    available_balance: number;
    staked_balance: number;
    pending_rewards: number;
    total_balance?: number;
    balance?: number;
    permissions?: any;
    created_at?: number;
    description?: string;
  }>;
}

export interface IdentityResponse {
  identity_id: string;
  did: string;
  display_name: string;
  identity_type: string;
  device_id?: string;
  created_at?: number;
  wallet_seed_phrases?: {
    master_seed_phrase?: string;
  };
  [key: string]: any;
}

class AppService {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_SOV_NODE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get wallet list for an identity
   */
  async getWalletList(identityId: string): Promise<WalletListResponse> {
    const url = toQuicUrl(`${this.baseUrl}/api/v1/wallet/list/${identityId}`);

    try {
      const headerIdentityId = await SecureIdentityStorage.getIdentityId();
      if (!headerIdentityId) {
        throw new Error('Missing identity for authenticated request');
      }

      const response = await quicRequest(url, {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'X-Zhtp-Identity': headerIdentityId,
        },
        alpn: 'authenticated',
        timeout: 10,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch wallet list: HTTP ${response.status}`);
      }

      const data = JSON.parse(response.body);
      console.log('[AppService] ✅ getWalletList:', { identityId, walletCount: data.wallets?.length || 0 });
      return data;
    } catch (error: any) {
      console.error('[AppService] ❌ getWalletList failed:', error.message);
      throw error;
    }
  }

  /**
   * Get identity information
   */
  async getIdentity(identityId: string): Promise<IdentityResponse> {
    const url = toQuicUrl(`${this.baseUrl}/api/v1/identities/${identityId}`);

    try {
      const headerIdentityId = await SecureIdentityStorage.getIdentityId();
      if (!headerIdentityId) {
        throw new Error('Missing identity for authenticated request');
      }

      const response = await quicRequest(url, {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'X-Zhtp-Identity': headerIdentityId,
        },
        alpn: 'authenticated',
        timeout: 10,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch identity: HTTP ${response.status}`);
      }

      const data = JSON.parse(response.body);
      console.log('[AppService] ✅ getIdentity:', { identityId, did: data.did });
      return data;
    } catch (error: any) {
      console.error('[AppService] ❌ getIdentity failed:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
const appService = new AppService(DEFAULT_SOV_NODE_URL);
export default appService;
