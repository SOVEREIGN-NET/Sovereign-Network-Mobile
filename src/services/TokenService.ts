/**
 * Token Service
 * Direct QUIC-based token operations (create, mint, transfer, etc.)
 */

import { quicRequest } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import type {
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

const normalizeDIDToAddress = (did: string): string => {
  if (did.startsWith('did:zhtp:')) {
    return did.substring('did:zhtp:'.length);
  }
  return did;
};

class TokenService {
  /** POST /api/v1/token/create — Dilithium-signed */
  async createToken(request: TokenCreateRequest): Promise<TokenCreateResponse> {
    console.log('[TokenService] Creating token:', request.name);
    const signingResult = await nativeIdentityProvisioning.signTokenCreateTransaction({
      name: request.name,
      symbol: request.symbol,
      initialSupply: Number(request.initial_supply),
      decimals: request.decimals,
      maxSupply: request.max_supply != null ? Number(request.max_supply) : null,
    });
    console.log('[TokenService] Transaction signed, hex length:', signingResult.signed_tx.length);

    const data = await quicRequest<TokenCreateResponse>(
      '/api/v1/token/create',
      { method: 'POST', body: JSON.stringify({ signed_tx: signingResult.signed_tx }) },
    );
    console.log('[TokenService] Token created:', data.token_id);
    return data;
  }

  /** POST /api/v1/token/mint — creator only, Dilithium-signed */
  async mintToken(request: TokenMintRequest): Promise<TokenMintResponse> {
    console.log('[TokenService] Minting tokens for:', request.token_id);
    const signingResult = await nativeIdentityProvisioning.signTokenMintTransaction({
      tokenId: request.token_id,
      amount: Number(request.amount),
      recipientDid: normalizeDIDToAddress(request.to),
    });
    console.log('[TokenService] Mint transaction signed, hex length:', signingResult.signed_tx.length);

    const data = await quicRequest<TokenMintResponse>(
      '/api/v1/token/mint',
      { method: 'POST', body: JSON.stringify({ signed_tx: signingResult.signed_tx }) },
    );
    console.log('[TokenService] Tokens minted:', data.amount_minted);
    return data;
  }

  /** POST /api/v1/token/transfer — Dilithium-signed */
  async transferToken(request: TokenTransferRequest): Promise<TokenTransferResponse> {
    console.log('[TokenService] Transferring tokens to:', request.to);
    const signingResult = await nativeIdentityProvisioning.signTokenTransferTransaction({
      tokenId: request.token_id,
      toAddress: normalizeDIDToAddress(request.to),
      amount: Number(request.amount),
    });
    console.log('[TokenService] Transfer transaction signed, hex length:', signingResult.signed_tx.length);

    const data = await quicRequest<TokenTransferResponse>(
      '/api/v1/token/transfer',
      { method: 'POST', body: JSON.stringify({ signed_tx: signingResult.signed_tx }) },
    );
    console.log('[TokenService] Transfer successful');
    return data;
  }

  /** GET /api/v1/token/{token_id} */
  async getTokenInfo(tokenId: string): Promise<TokenInfoResponse> {
    console.log('[TokenService] Fetching token info:', tokenId);
    const data = await quicRequest<TokenInfoResponse>(`/api/v1/token/${tokenId}`);
    console.log('[TokenService] Token info retrieved:', data.name);
    return data;
  }

  /** GET /api/v1/token/{token_id}/balance/{address} */
  async getTokenBalance(tokenId: string, address: string): Promise<TokenBalanceResponse> {
    console.log('[TokenService] Fetching balance for:', address);
    const data = await quicRequest<TokenBalanceResponse>(
      `/api/v1/token/${tokenId}/balance/${address}`,
    );
    console.log('[TokenService] Balance retrieved:', data.balance);
    return data;
  }

  /** GET /api/v1/token/list */
  async listTokens(): Promise<TokenListResponse> {
    console.log('[TokenService] Fetching token list');
    const data = await quicRequest<TokenListResponse>('/api/v1/token/list');
    console.log('[TokenService] Token list retrieved:', data.count, 'tokens');
    return data;
  }

  /** GET /api/v1/token/balances/{address} */
  async getUserTokenBalances(address: string): Promise<TokenBalanceResponse[]> {
    console.log('[TokenService] Fetching user token balances:', address);
    const data = await quicRequest<{ address: string; balances: TokenBalanceResponse[] }>(
      `/api/v1/token/balances/${address}`,
    );
    const balances = data.balances || [];
    console.log('[TokenService] User token balances retrieved:', balances.length, 'tokens');
    return balances;
  }

  /** POST /api/v1/token/burn — Dilithium-signed */
  // TODO: Blocked — signTokenBurnTransaction not yet exposed on NativeIdentityProvisioning bridge
  // (both platforms). The low-level FFI/JNI exists (zhtp_client_build_token_burn / nativeBuildTokenBurn)
  // but needs a @ReactMethod/@objc wrapper in NativeIdentityProvisioning on iOS and Android.
  async burnToken(request: { token_id: string; amount: number }): Promise<{ success: boolean; amount_burned: number }> {
    throw new Error(
      'burnToken not yet available — signTokenBurnTransaction bridge method not implemented on either platform',
    );
  }
}

const tokenServiceInstance = new TokenService();
export default tokenServiceInstance;
export { TokenService };
