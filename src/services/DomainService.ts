/**
 * Domain Service
 * Direct QUIC-based domain operations (register, check availability, manage, etc.)
 */

import { quicRequest } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import tokenService from './TokenService';
import { resolveTokenBySymbol } from '../hooks/useTokenRegistry';
import { maskIdentifier } from '../utils/maskIdentifier';
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

// 100 SOV at 18 decimals — DEFAULT_DOMAIN_REGISTRATION_FEE (Q10 / #2810).
export const DOMAIN_REGISTRATION_FEE_ATOMS = '100000000000000000000';
export const DOMAIN_REGISTRATION_FEE_SOV = 100;
/** Genesis-3 testnet chain id (matches AssetLaunch / TokenService). */
export const DOMAIN_CHAIN_ID = 2;

class DomainService {
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
   *
   * Canonical flow (mirrors updateDomain / transferDomain — lib-client owns
   * the whole signed JSON shape):
   *   1. Resolve SOV token id via the registry (no hardcoding).
   *   2. Fetch the sender wallet's current SOV nonce.
   *   3. Ask lib-client to sign the 100 SOV fee TokenTransfer (Primary →
   *      protocol treasury). Treasury wallet id defaults to lib-client's
   *      deterministic `blake3("SOV_DAO_TREASURY_V1")` constant.
   *   4. Ask lib-client to assemble + sign the full register request JSON,
   *      attaching the fee_payment_tx hex and domain_tx_signature_hex.
   *      Optional `asset_id` binds the domain to a sovereign asset (V3 / M4).
   *   5. POST the request_json.
   */
  async registerDomain(
    request: DomainRegisterRequest,
  ): Promise<DomainRegisterResponse> {
    console.log('[DomainService] Registering domain:', request.domain);

    const primaryWalletIdHex = request.primary_wallet_id?.trim() ?? '';
    if (primaryWalletIdHex.length !== 64) {
      throw new Error(
        'primary_wallet_id must be a 64-char hex wallet id (the owner\'s Primary wallet)',
      );
    }

    const assetIdHex = request.asset_id?.replace(/^0x/i, '').trim() || undefined;
    if (assetIdHex !== undefined && !/^[0-9a-fA-F]{64}$/.test(assetIdHex)) {
      throw new Error(
        'asset_id must be a 64-char hex sovereign asset id (no 0x required)',
      );
    }

    // 1. Resolve SOV token id from the registry — never hardcode (see useTokenRegistry).
    const sovToken = await resolveTokenBySymbol('SOV');
    if (!sovToken?.token_id) {
      throw new Error('SOV token not found in registry — cannot build domain fee tx');
    }

    // 2. Fetch the wallet's SOV nonce (same endpoint TokenService uses for transfers).
    const nonce = await tokenService.getTokenNonce(sovToken.token_id, primaryWalletIdHex);

    // 3. Sign the 100 SOV fee payment. Treasury id omitted → lib-client uses
    //    the deterministic blake3("SOV_DAO_TREASURY_V1") constant; no extra
    //    /api/v1/dao/treasury/status round-trip required.
    const feeTx = await nativeIdentityProvisioning.signDomainFeePaymentTx({
      senderWalletIdHex: primaryWalletIdHex,
      amountAtoms: DOMAIN_REGISTRATION_FEE_ATOMS,
      nonce,
      chainId: DOMAIN_CHAIN_ID,
    });

    // 4. Have lib-client build the full canonical register request JSON.
    const contentMappingsJson = request.content_mappings
      ? JSON.stringify(request.content_mappings)
      : null;
    const signingResult =
      await nativeIdentityProvisioning.signDomainRegisterRequestWithFeePayment({
        domain: request.domain,
        feePaymentTxHex: feeTx.fee_payment_tx_hex,
        contentMappingsJson,
        metadataJson: null,
        chainId: DOMAIN_CHAIN_ID,
        assetIdHex: assetIdHex ?? null,
      });

    const requestBody = JSON.parse(signingResult.request_json) as Record<
      string,
      unknown
    >;
    const domainTxSig = requestBody.domain_tx_signature_hex;
    if (typeof domainTxSig !== 'string' || domainTxSig.length === 0) {
      throw new Error(
        'domain_tx_signature_hex missing from signed request — rebuild the app so native lib-client includes the domain system tx signature (audit #2766)',
      );
    }

    console.log(
      '[DomainService] Register request built, json length:',
      signingResult.request_json.length,
      'domain_tx_signature_hex length:',
      domainTxSig.length,
    );

    // 5. POST.
    const data = await quicRequest<DomainRegisterResponse>(
      '/api/v1/web4/domains/register',
      { method: 'POST', body: signingResult.request_json },
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