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
 * Normalize a DID to just the hex address (strip did:zhtp: prefix)
 */
const normalizeDIDToAddress = (did: string): string => {
  if (did.startsWith('did:zhtp:')) {
    return did.substring('did:zhtp:'.length);
  }
  return did;
};

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

    console.log('[TokenService] QUIC adapter configured for token operations');
  }

  /**
   * POST /api/v1/token/create
   * Create a new token with Dilithium-signed transaction
   */
  async createToken(request: TokenCreateRequest): Promise<TokenCreateResponse> {
    try {
      console.log('[TokenService] Creating token:', request.name);
      console.log('[TokenService] Signing token create transaction with Dilithium keypair');
      const signingResult = await nativeIdentityProvisioning.signTokenCreateTransaction({
        name: request.name,
        symbol: request.symbol,
        initialSupply: request.initial_supply,
        decimals: request.decimals,
        maxSupply: request.max_supply,
      });

      const signedTx = signingResult.signed_tx;
      console.log('[TokenService] Transaction signed, hex length:', signedTx.length);

      // Send signed transaction to API
      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to create token`);
      }

      const data = await response.json();
      console.log('[TokenService] Token created:', data.token_id);
      return data;
    } catch (error: any) {
      console.error('[TokenService] Token creation failed:', error.message);
      throw new Error(error.message || 'Failed to create token');
    }
  }

  /**
   * POST /api/v1/token/mint
   * Mint additional tokens (creator only) with signed transaction
   */
  async mintToken(request: TokenMintRequest): Promise<TokenMintResponse> {
    try {
      console.log('[TokenService] Minting tokens for:', request.token_id);
      console.log('[TokenService] Signing token mint transaction with Dilithium keypair');
      const amountStr = typeof request.amount === 'string' ? request.amount : String(request.amount);
      const signingResult = await nativeIdentityProvisioning.signTokenMintTransaction({
        tokenId: request.token_id,
        amount: amountStr,
        recipientDid: normalizeDIDToAddress(request.to),
      });

      const signedTx = signingResult.signed_tx;
      console.log('[TokenService] Mint transaction signed, hex length:', signedTx.length);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/mint`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      const data = await response.json();
      console.log('[TokenService] Tokens minted:', data.amount_minted);
      return data;
    } catch (error: any) {
      console.error('[TokenService] Token mint failed:', error.message);
      throw new Error(error.message || 'Failed to mint tokens');
    }
  }

  /**
   * POST /api/v1/token/transfer
   * Transfer tokens between addresses with signed transaction
   */
  async transferToken(request: TokenTransferRequest): Promise<TokenTransferResponse> {
    try {
      console.log('[TokenService] Transferring tokens to:', request.to);
      console.log('[TokenService] Signing token transfer transaction with Dilithium keypair');
      const amountStr = typeof request.amount === 'string' ? request.amount : String(request.amount);
      const signingResult = await nativeIdentityProvisioning.signTokenTransferTransaction({
        tokenId: request.token_id,
        toAddress: normalizeDIDToAddress(request.to),
        amount: amountStr,
      });

      const signedTx = signingResult.signed_tx;
      console.log('[TokenService] Transfer transaction signed, hex length:', signedTx.length);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/transfer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      const data = await response.json();
      console.log('[TokenService] Transfer successful');
      return data;
    } catch (error: any) {
      console.error('[TokenService] Token transfer failed:', error.message);
      throw new Error(error.message || 'Failed to transfer tokens');
    }
  }

  /**
   * GET /api/v1/token/{token_id}
   * Get token information by ID
   */
  async getTokenInfo(tokenId: string): Promise<TokenInfoResponse> {
    try {
      console.log('[TokenService] Fetching token info:', tokenId);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/${tokenId}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Token not found`);
      }

      const data = await response.json();
      console.log('[TokenService] Token info retrieved:', data.name);
      return data;
    } catch (error: any) {
      console.error('[TokenService] Token info fetch failed:', error.message);
      throw new Error(error.message || 'Failed to fetch token info');
    }
  }

  /**
   * GET /api/v1/token/{token_id}/balance/{address}
   * Get token balance for an address
   */
  async getTokenBalance(tokenId: string, address: string): Promise<TokenBalanceResponse> {
    try {
      console.log('[TokenService] Fetching balance for:', address);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/${tokenId}/balance/${address}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = await response.json();
      console.log('[TokenService] Balance retrieved:', data.balance);
      return data;
    } catch (error: any) {
      console.error('[TokenService] Balance fetch failed:', error.message);
      throw new Error(error.message || 'Failed to fetch token balance');
    }
  }

  /**
   * GET /api/v1/token/list
   * Get list of all tokens on the network
   */
  async listTokens(): Promise<TokenListResponse> {
    try {
      console.log('[TokenService] Fetching token list');

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/list`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = await response.json();
      console.log('[TokenService] Token list retrieved:', data.count, 'tokens');
      return data;
    } catch (error: any) {
      console.error('[TokenService] Token list fetch failed:', error.message);
      throw new Error(error.message || 'Failed to fetch token list');
    }
  }

  /**
   * GET /api/v1/token/balances/{address}
   * Get all token balances for an address
   */
  async getUserTokenBalances(address: string): Promise<TokenBalanceResponse[]> {
    try {
      console.log('[TokenService] Fetching user token balances:', address);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/balances/${address}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      // Handle response - add extra debugging for Android JSON parse issues
      let data: any;

      if (!response.ok) {
        console.error('[TokenService] Non-OK response status:', response.status);
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      try {
        // Try JSON parsing with better error handling
        data = await response.json();
      } catch (jsonError: any) {
        console.error('[TokenService] JSON parse error:', jsonError.message);

        // Fallback: try to read as text and parse manually
        try {
          const bodyText = await response.text();
          console.error('[TokenService] Raw response body (first 200 chars):', bodyText.substring(0, 200));
          console.error('[TokenService] Body type:', typeof bodyText);
          console.error('[TokenService] Body length:', bodyText?.length);

          // Try parsing again with better error info
          data = JSON.parse(bodyText);
        } catch (fallbackError) {
          console.error('[TokenService] Fallback parse also failed:', fallbackError);
          throw new Error(`Failed to parse token balances response: ${jsonError.message}`);
        }
      }

      // API returns { address, balances: [...] } - extract the balances array
      const balances = data.balances || [];
      console.log('[TokenService] User token balances retrieved:', balances.length, 'tokens');
      return balances;
    } catch (error: any) {
      console.error('[TokenService] User token balances fetch failed:', error.message);
      throw new Error(error.message || 'Failed to fetch user token balances');
    }
  }

  /**
   * POST /api/v1/token/burn
   * Burn tokens with signed transaction
   */
  async burnToken(request: { token_id: string; amount: number }): Promise<{ success: boolean; amount_burned: number }> {
    try {
      console.log('[TokenService] Burning tokens for:', request.token_id);
      console.log('[TokenService] Signing token burn transaction with Dilithium keypair');
      const signingResult = await nativeIdentityProvisioning.signTokenBurnTransaction({
        tokenId: request.token_id,
        amount: request.amount,
      });

      const signedTx = signingResult.signed_tx;
      console.log('[TokenService] Burn transaction signed, hex length:', signedTx.length);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/token/burn`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      const data = await response.json();
      console.log('[TokenService] Tokens burned:', data.amount_burned);
      return data;
    } catch (error: any) {
      console.error('[TokenService] Token burn failed:', error.message);
      throw new Error(error.message || 'Failed to burn tokens');
    }
  }
}

import { DEFAULT_SOV_NODE_URL } from '../config';

// Export singleton instance
const tokenServiceInstance = new TokenService(DEFAULT_SOV_NODE_URL);
export default tokenServiceInstance;

// Also export the class for creating custom instances
export { TokenService };
