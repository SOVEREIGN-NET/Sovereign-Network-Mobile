/**
 * Domain Service
 * Direct QUIC-based domain operations (register, check availability, manage, etc.)
 * Uses native QUIC transport via QuicFetchAdapter - no HTTP fallback
 * Follows TokenService pattern exactly
 */

import { FetchAdapter } from '@sovereign-net/api-client/react-native';
import { createQuicFetchAdapterSync } from './QuicFetchAdapter';
import { QUIC_CONFIG } from '../config';
import { nativeIdentityProvisioning } from './NativeIdentityProvisioning';
import {
  DomainRegisterRequest,
  DomainRegisterResponse,
  DomainAvailabilityResult,
  DomainListResponse,
  DomainInfo,
  DomainStatusResponse,
  DomainHistoryResponse,
  DomainUpdateRequest,
  DomainUpdateResponse,
  DomainRollbackRequest,
  DomainRollbackResponse,
} from '../types/domain';

/**
 * Domain Service - All methods use QUIC authenticated endpoints
 */
class DomainService {
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

    console.log('[DomainService] QUIC adapter configured for domain operations');
  }

  /**
   * GET /api/v1/web4/domains/status/{domain}
   * Check domain availability and get its current status
   * Response: { found: boolean, domain, owner_did, ... }
   * - found: false → Domain is AVAILABLE
   * - found: true → Domain is TAKEN
   */
  async checkAvailability(domain: string): Promise<DomainAvailabilityResult> {
    try {
      console.log('[DomainService] Checking availability for domain:', domain);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/web4/domains/status/${domain}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to check domain availability`);
      }

      const data = await response.json();
      console.log('[DomainService] Domain status response:', { domain, found: data.found, owner_did: data.owner_did });

      return {
        available: !data.found, // found: false means available, found: true means taken
        classification: data.classification,
        reason: data.found ? `Domain is already registered by ${data.owner_did}` : undefined,
      };
    } catch (error: any) {
      console.error('[DomainService] Availability check failed:', error.message);
      throw new Error(error.message || 'Failed to check domain availability');
    }
  }

  /**
   * POST /api/v1/web4/domains/register
   * Register a new domain with Dilithium-signed transaction
   */
  async registerDomain(request: DomainRegisterRequest): Promise<DomainRegisterResponse> {
    try {
      console.log('[DomainService] Registering domain:', request.domain);
      console.log('[DomainService] Signing domain register transaction with Dilithium keypair');

      // Sign transaction (duration is handled at API level, not encoded in tx)
      const signingResult = await nativeIdentityProvisioning.signDomainRegisterTransaction({
        domain: request.domain,
        contentCid: undefined, // Optional content CID for initial registration
      });

      const signedTx = signingResult.signed_tx;
      console.log('[DomainService] Transaction signed, hex length:', signedTx.length);

      // Send signed transaction + duration to API
      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/web4/domains/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signed_tx: signedTx,
            duration_days: request.duration_days, // Duration sent as separate parameter
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to register domain`);
      }

      const data = await response.json();
      console.log('[DomainService] Domain registered:', data.domain);
      return data;
    } catch (error: any) {
      console.error('[DomainService] Domain registration failed:', error.message);
      throw new Error(error.message || 'Failed to register domain');
    }
  }

  /**
   * GET /api/v1/web4/domains?owner={did}
   * Get all domains owned by a user
   */
  async getUserDomains(ownerDid: string): Promise<DomainListResponse> {
    try {
      console.log('[DomainService] Fetching domains for owner:', ownerDid);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/web4/domains?owner=${encodeURIComponent(ownerDid)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch user domains`);
      }

      const data = await response.json();
      console.log('[DomainService] Found', data.count, 'domains for owner');
      return data;
    } catch (error: any) {
      console.error('[DomainService] Failed to fetch user domains:', error.message);
      throw new Error(error.message || 'Failed to fetch domains');
    }
  }

  /**
   * GET /api/v1/web4/domains/status/{domain}
   * Get detailed status of a specific domain
   */
  async getDomainStatus(domain: string): Promise<DomainStatusResponse> {
    try {
      console.log('[DomainService] Fetching status for domain:', domain);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/web4/domains/status/${domain}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // Domain doesn't exist, but we can still return status
          return {
            domain,
            available: true,
            classification: 'commercial',
          };
        }
        throw new Error(`HTTP ${response.status}: Failed to fetch domain status`);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('[DomainService] Failed to fetch domain status:', error.message);
      throw new Error(error.message || 'Failed to fetch domain status');
    }
  }

  /**
   * GET /api/v1/web4/domains/{domain}/history
   * Get the history of changes for a domain
   */
  async getDomainHistory(domain: string): Promise<DomainHistoryResponse> {
    try {
      console.log('[DomainService] Fetching history for domain:', domain);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/web4/domains/${domain}/history`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch domain history`);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('[DomainService] Failed to fetch domain history:', error.message);
      throw new Error(error.message || 'Failed to fetch domain history');
    }
  }

  /**
   * POST /api/v1/web4/domains/update
   * Update domain content (e.g., point to new CID)
   */
  async updateDomain(request: DomainUpdateRequest): Promise<DomainUpdateResponse> {
    try {
      console.log('[DomainService] Updating domain:', request.domain);
      console.log('[DomainService] Signing domain update transaction with Dilithium keypair');

      const signingResult = await nativeIdentityProvisioning.signDomainUpdateTransaction({
        domain: request.domain,
        contentCid: request.content_cid,
      });

      const signedTx = signingResult.signed_tx;
      console.log('[DomainService] Update transaction signed, hex length:', signedTx.length);

      // Send signed transaction to API
      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/web4/domains/update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to update domain`);
      }

      const data = await response.json();
      console.log('[DomainService] Domain updated:', data.domain);
      return data;
    } catch (error: any) {
      console.error('[DomainService] Domain update failed:', error.message);
      throw new Error(error.message || 'Failed to update domain');
    }
  }

  /**
   * POST /api/v1/web4/domains/{domain}/rollback
   * Rollback domain to a previous version
   */
  async rollbackDomain(request: DomainRollbackRequest): Promise<DomainRollbackResponse> {
    try {
      console.log('[DomainService] Rolling back domain:', request.domain);

      const response = await this.quicFetch(
        `${this.nodeUrl}/api/v1/web4/domains/${request.domain}/rollback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: request.version }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to rollback domain`);
      }

      const data = await response.json();
      console.log('[DomainService] Domain rolled back:', data.domain);
      return data;
    } catch (error: any) {
      console.error('[DomainService] Domain rollback failed:', error.message);
      throw new Error(error.message || 'Failed to rollback domain');
    }
  }
}

// Export singleton instance using the default node URL from config
import { DEFAULT_SOV_NODE_URL } from '../config';

const domainService = new DomainService(DEFAULT_SOV_NODE_URL);
export default domainService;
