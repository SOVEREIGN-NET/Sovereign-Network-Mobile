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
      console.log('[AppService] getWalletList:', { identityId, walletCount: data.wallets?.length || 0 });
      return data;
    } catch (error: unknown) {
      console.error('[AppService] getWalletList failed:', error instanceof Error ? error.message : error);
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
      console.error('[AppService] getIdentity failed:', error instanceof Error ? error.message : error);
      throw error;
    }
  }
}

const appService = new AppService();
export default appService;
