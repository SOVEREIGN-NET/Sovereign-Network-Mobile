/**
 * Token Service
 * Direct QUIC-based token operations (create, mint, transfer, etc.)
 * Uses native QUIC transport via QuicFetchAdapter - no HTTP fallback
 */

import { FetchAdapter } from '@sovereign-net/api-client/react-native';
import { createQuicFetchAdapterSync } from './QuicFetchAdapter';
import { QUIC_CONFIG } from '../config';
import SecureIdentityStorage from './SecureIdentityStorage';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import {
  TokenCreateRequest,
  TokenCreateResponse,
  TokenMintRequest,
  TokenMintResponse,
  TokenTransferRequest,
  TokenTransferResponse,
  TokenInfoResponse,
  TokenBalanceResponse,
  TokenListResponse,
} from '../types/token';

/**
 * Token Service - All methods use QUIC authenticated endpoints
 */
class TokenService {
  private readonly quicFetch: FetchAdapter;
  private readonly nodeUrl: string;

  constructor(nodeUrl: string) {
    this.nodeUrl = nodeUrl;

    // Create QUIC-based fetch adapter for native transport
    this.quicFetch = createQuicFetchAdapterSync({
      insecure: QUIC_CONFIG.insecure,
      timeout: QUIC_CONFIG.defaultTimeout,
      fallbackToHttp: QUIC_CONFIG.fallbackToHttp,
      onFallback: (url, reason) => {
        throw new Error(
          `QUIC connection required but failed: ${reason}. ` +
          `HTTP fallback is disabled for security.`
        );
      },
    });

    console.log('[TokenService] ✅ QUIC adapter configured for token operations');
  }

  /**
   * POST /api/v1/token/create
   * Create a new token with Dilithium-signed transaction
   */
  async createToken(request: TokenCreateRequest): Promise<TokenCreateResponse> {
    try {
      console.log('[TokenService] 🔄 Creating token:', request.name);
      console.log('[TokenService] 🔐 Signing token create transaction with Dilithium keypair');
      const signingResult = await nativeIdentityProvisioning.signTokenCreateTransaction({
        name: request.name,
        symbol: request.symbol,
        initialSupply: request.initial_supply,
        decimals: request.decimals,
        maxSupply: request.max_supply,
      });

      const signedTx = signingResult.signed_tx;
      console.log('[TokenService] ✅ Transaction signed, hex length:', signedTx.length);

      // Send signed transaction to API
      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      const data = await response.json();
      console.log('[TokenService] ✅ Token created:', data.token_id);
      return data;
    } catch (error: any) {
      console.error('[TokenService] ❌ Token creation failed:', error.message);
      throw new Error(error.message || 'Failed to create token');
    }
  }

  /**
   * POST /api/v1/token/mint
   * Mint additional tokens (creator only) with signed transaction
   */
  async mintToken(request: TokenMintRequest): Promise<TokenMintResponse> {
    try {
      console.log('[TokenService] 🔄 Minting tokens for:', request.token_id);
      console.log('[TokenService] 🔐 Signing token mint transaction with Dilithium keypair');
      const signingResult = await nativeIdentityProvisioning.signTokenMintTransaction({
        tokenId: request.token_id,
        amount: request.amount,
        recipientDid: request.to,
      });

      const signedTx = signingResult.signed_tx;
      console.log('[TokenService] ✅ Mint transaction signed, hex length:', signedTx.length);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/mint`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      const data = await response.json();
      console.log('[TokenService] ✅ Tokens minted:', data.amount_minted);
      return data;
    } catch (error: any) {
      console.error('[TokenService] ❌ Token mint failed:', error.message);
      throw new Error(error.message || 'Failed to mint tokens');
    }
  }

  /**
   * POST /api/v1/token/transfer
   * Transfer tokens between addresses with signed transaction
   */
  async transferToken(request: TokenTransferRequest): Promise<TokenTransferResponse> {
    try {
      console.log('[TokenService] 🔄 Transferring tokens to:', request.to);
      console.log('[TokenService] 🔐 Signing token transfer transaction with Dilithium keypair');
      const signingResult = await nativeIdentityProvisioning.signTokenTransferTransaction({
        tokenId: request.token_id,
        toAddress: request.to,
        amount: request.amount,
      });

      const signedTx = signingResult.signed_tx;
      console.log('[TokenService] ✅ Transfer transaction signed, hex length:', signedTx.length);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/transfer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      const data = await response.json();
      console.log('[TokenService] ✅ Transfer successful');
      return data;
    } catch (error: any) {
      console.error('[TokenService] ❌ Token transfer failed:', error.message);
      throw new Error(error.message || 'Failed to transfer tokens');
    }
  }

  /**
   * GET /api/v1/token/{token_id}
   * Get token information by ID
   */
  async getTokenInfo(tokenId: string): Promise<TokenInfoResponse> {
    try {
      console.log('[TokenService] 🔄 Fetching token info:', tokenId);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/${tokenId}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = await response.json();
      console.log('[TokenService] ✅ Token info retrieved:', data.name);
      return data;
    } catch (error: any) {
      console.error('[TokenService] ❌ Token info fetch failed:', error.message);
      throw new Error(error.message || 'Failed to fetch token info');
    }
  }

  /**
   * GET /api/v1/token/{token_id}/balance/{address}
   * Get token balance for an address
   */
  async getTokenBalance(tokenId: string, address: string): Promise<TokenBalanceResponse> {
    try {
      console.log('[TokenService] 🔄 Fetching balance for:', address);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/${tokenId}/balance/${address}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = await response.json();
      console.log('[TokenService] ✅ Balance retrieved:', data.balance);
      return data;
    } catch (error: any) {
      console.error('[TokenService] ❌ Balance fetch failed:', error.message);
      throw new Error(error.message || 'Failed to fetch token balance');
    }
  }

  /**
   * GET /api/v1/token/list
   * Get list of all tokens on the network
   */
  async listTokens(): Promise<TokenListResponse> {
    try {
      console.log('[TokenService] 🔄 Fetching token list');

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/list`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = await response.json();
      console.log('[TokenService] ✅ Token list retrieved:', data.count, 'tokens');
      return data;
    } catch (error: any) {
      console.error('[TokenService] ❌ Token list fetch failed:', error.message);
      throw new Error(error.message || 'Failed to fetch token list');
    }
  }
}

import { DEFAULT_SOV_NODE_URL } from '../config';

// Export singleton instance
const tokenServiceInstance = new TokenService(DEFAULT_SOV_NODE_URL);
export default tokenServiceInstance;

// Also export the class for creating custom instances
export { TokenService };
