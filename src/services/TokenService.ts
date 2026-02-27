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
  TokenBurnRequest,
  TokenBurnResponse,
  SovTransferRequest,
  SovTransferResponse,
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
  /** GET /api/v1/token/nonce/{token_id}/{address} - for all tokens including SOV */
  async getTokenNonce(tokenId: string, address: string): Promise<number> {
    console.log(
      '[TokenService] Fetching nonce for token:',
      tokenId,
      'address:',
      address,
    );
    const data = await quicRequest<{ nonce: number }>(
      `/api/v1/token/nonce/${tokenId}/${address}`,
    );
    console.log('[TokenService] Nonce retrieved:', data.nonce);
    return data.nonce;
  }

  /** POST /api/v1/token/create — Dilithium-signed */
  async createToken(request: TokenCreateRequest): Promise<TokenCreateResponse> {
    console.log('[TokenService] Creating token:', request.name);
    const signingResult =
      await nativeIdentityProvisioning.signTokenCreateTransaction({
        name: request.name,
        symbol: request.symbol,
        initialSupply: Number(request.initial_supply),
        decimals: request.decimals,
        maxSupply:
          request.max_supply != null ? Number(request.max_supply) : null,
      });
    console.log(
      '[TokenService] Transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<TokenCreateResponse>(
      '/api/v1/token/create',
      {
        method: 'POST',
        body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
      },
    );
    console.log('[TokenService] Token created:', data.token_id);
    return data;
  }

  /** POST /api/v1/token/mint — creator only, Dilithium-signed */
  async mintToken(request: TokenMintRequest): Promise<TokenMintResponse> {
    console.log('[TokenService] Minting tokens for:', request.token_id);
    const signingResult =
      await nativeIdentityProvisioning.signTokenMintTransaction({
        tokenId: request.token_id,
        amount: Number(request.amount),
        recipientDid: normalizeDIDToAddress(request.to),
      });
    console.log(
      '[TokenService] Mint transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<TokenMintResponse>('/api/v1/token/mint', {
      method: 'POST',
      body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
    });
    console.log('[TokenService] Tokens minted:', data.amount_minted);
    return data;
  }

  /** POST /api/v1/token/transfer — Dilithium-signed */
  async transferToken(
    request: TokenTransferRequest,
  ): Promise<TokenTransferResponse> {
    console.log('[TokenService] Transferring tokens to:', request.to);

    const nonce =
      request.nonce ??
      (await this.getTokenNonce(
        request.token_id,
        normalizeDIDToAddress(request.to),
      ));
    console.log('[TokenService] Using nonce:', nonce);

    const signingResult =
      await nativeIdentityProvisioning.signTokenTransferTransaction({
        tokenId: request.token_id,
        toAddress: normalizeDIDToAddress(request.to),
        amount: Number(request.amount),
        nonce: nonce,
      });
    console.log(
      '[TokenService] Transfer transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<TokenTransferResponse>(
      '/api/v1/token/transfer',
      {
        method: 'POST',
        body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
      },
    );
    console.log('[TokenService] Transfer successful');
    return data;
  }

  /** POST /api/v1/token/transfer — SOV wallet-to-wallet, Dilithium-signed */
  async transferSov(request: SovTransferRequest): Promise<SovTransferResponse> {
    console.log(
      '[TokenService] Transferring SOV:',
      request.from_wallet_id,
      '->',
      request.to_wallet_id,
    );
    console.log('[TokenService] SOV token_id:', request.token_id);

    // FORCE fresh nonce fetch - ignore any cached/nonce parameter
    console.log(
      '[TokenService] FORCE FETCHING nonce for token_id:',
      request.token_id,
      'wallet:',
      request.from_wallet_id,
    );
    const nonce = await this.getTokenNonce(
      request.token_id,
      request.from_wallet_id,
    );
    console.log('[TokenService] FRESH nonce from server:', nonce);

    console.log(
      '[TokenService] >>> USING NONCE FOR TX:',
      nonce,
      'type:',
      typeof nonce,
    );
    console.log(
      '[TokenService] >>> CALLING native signSovWalletTransferTransaction...',
    );
    console.log('[TokenService] >>> PARAMS:', {
      fromWalletId: request.from_wallet_id,
      toWalletId: request.to_wallet_id,
      amount: Number(request.amount),
      nonce: nonce,
    });

    const signingResult =
      await nativeIdentityProvisioning.signSovWalletTransferTransaction({
        fromWalletId: request.from_wallet_id,
        toWalletId: request.to_wallet_id,
        amount: Number(request.amount),
        nonce: nonce,
      });
    console.log(
      '[TokenService] SOV transfer transaction signed, hex length:',
      signingResult.signed_tx.length,
    );
    console.log(
      '[TokenService] SOV transfer signed_tx first 64 chars:',
      signingResult.signed_tx.substring(0, 64),
    );

    const data = await quicRequest<SovTransferResponse>(
      '/api/v1/token/transfer',
      {
        method: 'POST',
        body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
      },
    );
    console.log('[TokenService] SOV transfer response:', JSON.stringify(data));
    console.log('[TokenService] SOV transfer tx_hash:', (data as any).tx_hash);
    console.log('[TokenService] SOV transfer successful');
    return data;
  }

  /** GET /api/v1/token/{token_id} */
  async getTokenInfo(tokenId: string): Promise<TokenInfoResponse> {
    console.log('[TokenService] Fetching token info:', tokenId);
    const data = await quicRequest<TokenInfoResponse>(
      `/api/v1/token/${tokenId}`,
    );
    console.log('[TokenService] Token info retrieved:', data.name);
    return data;
  }

  /** GET /api/v1/token/{token_id}/balance/{address} */
  async getTokenBalance(
    tokenId: string,
    address: string,
  ): Promise<TokenBalanceResponse> {
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
    const data = await quicRequest<{
      address: string;
      balances: TokenBalanceResponse[];
    }>(`/api/v1/token/balances/${address}`);
    const balances = data.balances || [];
    console.log(
      '[TokenService] User token balances retrieved:',
      balances.length,
      'tokens',
    );
    return balances;
  }

  /** POST /api/v1/token/burn — Dilithium-signed */
  async burnToken(request: TokenBurnRequest): Promise<TokenBurnResponse> {
    console.log('[TokenService] Burning tokens for:', request.token_id);
    const signingResult =
      await nativeIdentityProvisioning.signTokenBurnTransaction({
        tokenId: request.token_id,
        amount: Number(request.amount),
      });
    console.log(
      '[TokenService] Burn transaction signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<TokenBurnResponse>('/api/v1/token/burn', {
      method: 'POST',
      body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
    });
    console.log('[TokenService] Tokens burned:', data.amount_burned);
    return data;
  }
}

const tokenServiceInstance = new TokenService();
export default tokenServiceInstance;
export { TokenService };
