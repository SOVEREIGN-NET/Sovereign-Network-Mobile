/**
 * Token Service
 * Direct QUIC-based token operations (create, mint, transfer, etc.)
 */

import { quicRequest, publicQuicRequest } from './quic';
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

/**
 * Normalize a raw atoms value from the node into a canonical decimal string.
 *
 * The node now returns u128 balances as JSON strings (e.g. "5000000000000000000000")
 * to avoid Number precision loss. This helper accepts string | number | null | undefined
 * for defensive parsing during the migration and always returns a clean integer string.
 *
 * Returns "0" for null/undefined/empty. Throws on non-integer or negative input.
 */
const parseAtoms = (v: unknown): string => {
  if (v == null || v === '') return '0';
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`parseAtoms: invalid numeric atoms value ${v}`);
    }
    return BigInt(Math.trunc(v)).toString();
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`parseAtoms: non-integer atoms string "${v}"`);
    }
    return BigInt(trimmed).toString();
  }
  throw new Error(`parseAtoms: unsupported atoms type ${typeof v}`);
};

const parseAtomsOrNull = (v: unknown): string | null => {
  if (v == null) return null;
  return parseAtoms(v);
};

const normalizeBalance = (b: TokenBalanceResponse): TokenBalanceResponse => ({
  ...b,
  balance: parseAtoms(b.balance),
});

const normalizeTokenInfo = (t: TokenInfoResponse): TokenInfoResponse => ({
  ...t,
  total_supply: parseAtoms(t.total_supply),
  max_supply: parseAtomsOrNull(t.max_supply),
});

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

    // Step 1: fetch fee config and push to Rust before signing (spec requirement).
    // token_creation_fee must be current so the builder uses the right atomic.
    // Default is 1000 if the call fails.
    try {
      const feeConfig = await publicQuicRequest<Record<string, unknown>>('/api/v1/blockchain/fee-config');
      const configStr = JSON.stringify(feeConfig);
      await nativeIdentityProvisioning.setFeeConfig(configStr);
      console.log('[TokenService] Fee config updated, token_creation_fee:', feeConfig.token_creation_fee);
    } catch (err) {
      console.warn('[TokenService] Fee config refresh failed, using cached/default:', err);
    }

    const signingResult =
      await nativeIdentityProvisioning.signTokenCreateTransaction({
        name: request.name,
        symbol: request.symbol,
        initialSupply: String(request.initial_supply),
        decimals: request.decimals,
        maxSupply:
          request.max_supply != null ? String(request.max_supply) : null,
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

  /**
   * POST /api/v1/token/transfer — legacy identity-key sender path.
   *
   * Only useful for tokens whose balance lives at the identity key_id.
   * For tokens held at wallet_id (e.g. CBE), call `transferTokenFromWallet`
   * which signs with an explicit `fromWalletId`.
   *
   * If `request.from` is provided, the sender address is used for the nonce
   * lookup. Otherwise falls back to the *recipient* address — that fallback
   * is almost certainly wrong for real transfers and remains only for legacy
   * callers that haven't been migrated.
   */
  async transferToken(
    request: TokenTransferRequest,
  ): Promise<TokenTransferResponse> {
    console.log('[TokenService] Transferring tokens to:', request.to);

    const senderForNonce = request.from
      ? normalizeDIDToAddress(request.from)
      : normalizeDIDToAddress(request.to);
    if (!request.from) {
      console.warn(
        '[TokenService] transferToken called without `from` — nonce lookup will target the recipient. This path is only correct for identity-key tokens.',
      );
    }
    const nonce =
      request.nonce ?? (await this.getTokenNonce(request.token_id, senderForNonce));
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

  /**
   * POST /api/v1/token/transfer — wallet_id sender path.
   *
   * Use this for CBE and any token whose balance lives at `wallet_id` rather
   * than the identity key. The signed transaction carries an explicit
   * `from_wallet_id`, mirroring `transferSov` but parameterized by token.
   *
   * Nonce is fetched against (tokenId, fromWalletId) — the *sender*, not the
   * recipient, which is the common footgun of the legacy `transferToken`.
   */
  async transferTokenFromWallet(request: {
    token_id: string;
    from_wallet_id: string;
    to_wallet_id: string;
    amount: string | number;
    chain_id?: number;
  }): Promise<TokenTransferResponse> {
    console.log(
      '[TokenService] Transferring token from wallet:',
      request.from_wallet_id,
      '->',
      request.to_wallet_id,
      'token:',
      request.token_id,
    );

    const nonce = await this.getTokenNonce(
      request.token_id,
      request.from_wallet_id,
    );
    console.log('[TokenService] Fresh nonce from server:', nonce);

    const signingResult =
      await nativeIdentityProvisioning.signTokenWalletTransferTransaction({
        tokenId: request.token_id,
        fromWalletId: request.from_wallet_id,
        toWalletId: request.to_wallet_id,
        amount: Number(request.amount),
        nonce,
        chainId: request.chain_id,
      });
    console.log(
      '[TokenService] Token wallet transfer signed, hex length:',
      signingResult.signed_tx.length,
    );

    const data = await quicRequest<TokenTransferResponse>(
      '/api/v1/token/transfer',
      {
        method: 'POST',
        body: JSON.stringify({ signed_tx: signingResult.signed_tx }),
      },
    );
    console.log('[TokenService] Token wallet transfer successful');
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
    return normalizeTokenInfo(data);
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
    const normalized = normalizeBalance(data);
    console.log('[TokenService] Balance retrieved:', normalized.balance);
    return normalized;
  }

  /** GET /api/v1/token/list */
  async listTokens(): Promise<TokenListResponse> {
    console.log('[TokenService] Fetching token list');
    const data = await quicRequest<TokenListResponse>('/api/v1/token/list');
    console.log('[TokenService] Token list retrieved:', data.count, 'tokens');
    return {
      ...data,
      tokens: (data.tokens || []).map(t => ({
        ...t,
        total_supply: parseAtoms(t.total_supply),
      })),
    };
  }

  /** GET /api/v1/token/balances/{address} */
  async getUserTokenBalances(address: string): Promise<TokenBalanceResponse[]> {
    console.log('[TokenService] Fetching user token balances:', address);
    const data = await quicRequest<{
      address: string;
      balances: TokenBalanceResponse[];
    }>(`/api/v1/token/balances/${address}`);
    const balances = (data.balances || []).map(normalizeBalance);
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
