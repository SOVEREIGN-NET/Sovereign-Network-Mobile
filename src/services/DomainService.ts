/**
 * Domain Service
 * Direct QUIC-based domain operations (register, check availability, manage, etc.)
 */

import { quicRequest, quicRequestRaw } from './quic';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
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
      reason: data.found ? `Domain is already registered by ${data.owner_did}` : undefined,
      registrar_fee: data.registrar_fee,
    };
  }

  /**
   * POST /api/v1/web4/domains/register — Dilithium-signed
   * lib-client builds the complete signed request body (domain, owner, content_mappings, signature, timestamp, fee)
   */
  async registerDomain(request: DomainRegisterRequest): Promise<DomainRegisterResponse> {
    console.log('[DomainService] Registering domain:', request.domain);
    const contentMappingsJson = request.content_mappings
      ? JSON.stringify(request.content_mappings)
      : null;
    const signingResult = await nativeIdentityProvisioning.signDomainRegisterRequest({
      domain: request.domain,
      contentMappingsJson,
    });
    console.log('[DomainService] Register request built, json length:', signingResult.request_json.length);

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
      if (error instanceof Error && 'status' in error && (error as any).status === 404) {
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
  async updateDomain(request: DomainUpdateRequest): Promise<DomainUpdateResponse> {
    console.log('[DomainService] Updating domain:', request.domain);
    const signingResult = await nativeIdentityProvisioning.signDomainUpdateRequest({
      domain: request.domain,
      newManifestCid: request.new_manifest_cid,
      expectedPreviousManifestCid: request.expected_previous_manifest_cid,
    });
    console.log('[DomainService] Update request built, json length:', signingResult.request_json.length);

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
  async rollbackDomain(request: DomainRollbackRequest): Promise<DomainRollbackResponse> {
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
