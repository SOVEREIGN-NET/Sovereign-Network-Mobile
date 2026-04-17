/**
 * Domain Service
 * Direct QUIC-based domain operations (register, check availability, manage, etc.)
 */

import { quicRequest } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import tokenService from './TokenService';
import { maskIdentifier } from '../utils/maskIdentifier';
import { CHAIN_ID } from '../config';
import { humanToAtomic } from '../utils/tokenUnits';
import { resolveTokenBySymbol } from '../hooks/useTokenRegistry';
import type {
  DomainRegisterRequest,
  DomainRegisterResponse,
  DomainAvailabilityResult,
  DomainListResponse,
  DomainStatusResponse,
  DomainHistoryResponse,
  DomainUpdateRequest,
  DomainUpdateResponse,
  DomainRollbackRequest,
  DomainRollbackResponse,
} from '../types/domain';

class DomainService {
  private normalizeIdentityId(identityOrDid: string): string {
    return identityOrDid.startsWith('did:zhtp:')
      ? identityOrDid.substring('did:zhtp:'.length)
      : identityOrDid;
  }

  private async getPrimaryWalletId(ownerDid: string): Promise<string> {
    const identityId = this.normalizeIdentityId(ownerDid);
    const walletList = await quicRequest<{
      wallets?: Array<{
        wallet_id?: string;
        id?: string;
        wallet_type?: string;
      }>;
    }>(`/api/v1/wallet/list/${identityId}`);

    const primaryWallet = walletList.wallets?.find(
      wallet => (wallet.wallet_type || '').toLowerCase() === 'primary',
    );
    const walletId = primaryWallet?.wallet_id || primaryWallet?.id;
    if (!walletId) {
      throw new Error('Primary wallet not found for identity');
    }
    return walletId;
  }

  private async getDaoTreasuryWalletId(): Promise<string> {
    const data = await quicRequest<{
      treasury?: {
        treasury_wallet_id?: string | null;
      };
    }>('/api/v1/dao/treasury/status');

    const treasuryWalletId = data.treasury?.treasury_wallet_id;
    if (!treasuryWalletId) {
      throw new Error('DAO treasury wallet id is not available');
    }
    return treasuryWalletId;
  }

  /**
   * GET /api/v1/web4/domains/status/{domain}
   * Check domain availability.
   * found: false → available, found: true → taken
   */
  async checkAvailability(domain: string): Promise<DomainAvailabilityResult> {
    console.log('[DomainService] Checking availability for domain:', domain);
    const data = await quicRequest<{
      found: boolean;
      classification?: string;
      owner_did?: string;
      registrar_fee?: number;
    }>(`/api/v1/web4/domains/status/${domain}`);

    console.log('[DomainService] Domain status response:', {
      domain,
      found: data.found,
      owner_did: maskIdentifier(data.owner_did),
    });

    return {
      available: !data.found,
      classification: data.classification,
      reason: data.found
        ? `Domain is already registered by ${data.owner_did}`
        : undefined,
      registrar_fee: data.registrar_fee,
    };
  }

  /**
   * POST /api/v1/web4/domains/register
   * Domain registration now requires a canonical fee payment transaction.
   */
  async registerDomain(
    request: DomainRegisterRequest,
  ): Promise<DomainRegisterResponse> {
    console.log('[DomainService] Registering domain:', request.domain);

    const fee =
      Number.isFinite(request.fee) && request.fee > 0 ? request.fee : 10;
    const timestamp = Math.floor(Date.now() / 1000);
    const [ownerPrimaryWalletId, daoTreasuryWalletId] = await Promise.all([
      this.getPrimaryWalletId(request.owner),
      this.getDaoTreasuryWalletId(),
    ]);

    const sovToken = await resolveTokenBySymbol('SOV');
    if (!sovToken) {
      throw new Error(
        'SOV token not found in chain registry — node may be unavailable',
      );
    }
    const nonce = await tokenService.getTokenNonce(
      sovToken.token_id,
      ownerPrimaryWalletId,
    );

    const feeAtoms = humanToAtomic(String(fee), 18);
    if (!feeAtoms) {
      throw new Error(`Invalid domain fee amount: ${fee}`);
    }

    const feePaymentTx =
      await nativeIdentityProvisioning.signSovWalletTransferTransaction({
        fromWalletId: ownerPrimaryWalletId,
        toWalletId: daoTreasuryWalletId,
        // Pass atoms as a u128 decimal string — Number(feeAtoms) would round
        // a 1e19+ value and the native bridge now rejects unsafe integers.
        amount: feeAtoms,
        nonce: nonce,
        chainId: CHAIN_ID,
      });

    const signatureMessage = `${request.domain}|${timestamp}|${fee}`;
    const signature = await nativeIdentityProvisioning.signMessage(
      signatureMessage,
    );

    const payload = JSON.stringify({
      domain: request.domain,
      owner: request.owner,
      content_mappings: request.content_mappings ?? {},
      metadata: request.metadata ?? null,
      signature,
      timestamp,
      fee,
      fee_payment_tx: feePaymentTx.signed_tx,
    });

    console.log(
      '[DomainService] Register request built, json length:',
      payload.length,
    );

    const data = await quicRequest<DomainRegisterResponse>(
      '/api/v1/web4/domains/register',
      { method: 'POST', body: payload },
    );
    console.log('[DomainService] Domain registered:', data.domain);
    return data;
  }

  /**
   * GET /api/v1/web4/domains?owner={did}
   */
  async getUserDomains(ownerDid: string): Promise<DomainListResponse> {
    console.log('[DomainService] Fetching domains for owner:', ownerDid);
    const data = await quicRequest<DomainListResponse>(
      `/api/v1/web4/domains?owner=${encodeURIComponent(ownerDid)}`,
    );
    console.log('[DomainService] Found', data.count, 'domains for owner');
    return data;
  }

  /**
   * GET /api/v1/web4/domains/status/{domain}
   */
  async getDomainStatus(domain: string): Promise<DomainStatusResponse> {
    console.log('[DomainService] Fetching status for domain:', domain);
    try {
      return await quicRequest<DomainStatusResponse>(
        `/api/v1/web4/domains/status/${domain}`,
      );
    } catch (error: unknown) {
      // 404 means domain doesn't exist — return "available" status
      if (
        error instanceof Error &&
        'status' in error &&
        (error as any).status === 404
      ) {
        return { domain, available: true, classification: 'commercial' };
      }
      throw error;
    }
  }

  /**
   * GET /api/v1/web4/domains/{domain}/history
   */
  async getDomainHistory(domain: string): Promise<DomainHistoryResponse> {
    console.log('[DomainService] Fetching history for domain:', domain);
    return await quicRequest<DomainHistoryResponse>(
      `/api/v1/web4/domains/${domain}/history`,
    );
  }

  /**
   * POST /api/v1/web4/domains/update — Dilithium-signed
   * lib-client builds the complete signed request body (domain, new_manifest_cid, expected_previous_manifest_cid, signature, timestamp)
   */
  async updateDomain(
    request: DomainUpdateRequest,
  ): Promise<DomainUpdateResponse> {
    console.log('[DomainService] Updating domain:', request.domain);
    const signingResult =
      await nativeIdentityProvisioning.signDomainUpdateRequest({
        domain: request.domain,
        newManifestCid: request.new_manifest_cid,
        expectedPreviousManifestCid: request.expected_previous_manifest_cid,
      });
    console.log(
      '[DomainService] Update request built, json length:',
      signingResult.request_json.length,
    );

    const data = await quicRequest<DomainUpdateResponse>(
      '/api/v1/web4/domains/update',
      { method: 'POST', body: signingResult.request_json },
    );
    console.log('[DomainService] Domain updated:', data.domain);
    return data;
  }

  /**
   * POST /api/v1/web4/domains/{domain}/rollback
   */
  async rollbackDomain(
    request: DomainRollbackRequest,
  ): Promise<DomainRollbackResponse> {
    console.log('[DomainService] Rolling back domain:', request.domain);
    const data = await quicRequest<DomainRollbackResponse>(
      `/api/v1/web4/domains/${request.domain}/rollback`,
      { method: 'POST', body: JSON.stringify({ version: request.version }) },
    );
    console.log('[DomainService] Domain rolled back:', data.domain);
    return data;
  }
}

const domainService = new DomainService();
export default domainService;
