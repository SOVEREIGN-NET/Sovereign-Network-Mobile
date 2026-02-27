/**
 * Web4 Client - Direct QUIC calls for Web4 endpoints
 * Uses public ALPN for Web4 content endpoints (read-only, no auth)
 */

import { publicQuicRequest } from './quic';

export interface Web4ResolveResponse {
  domain: string;
  manifest_cid?: string;
  web4_manifest_cid?: string;
  error?: string;
}

export interface Web4ManifestResponse {
  cid: string;
  files?: Record<string, unknown>;
  error?: string;
}

class Web4Client {
  /**
   * Resolve a Web4 domain to get manifest CID
   */
  async resolveDomain(domain: string): Promise<Web4ResolveResponse> {
    try {
      const data = await publicQuicRequest<Record<string, unknown>>(
        '/api/v1/web4/domains/resolve',
        {
          method: 'POST',
          body: JSON.stringify({ domain, version: null }),
          headers: { 'content-type': 'application/json' },
        },
      );
      const nested =
        (typeof data.data === 'object' && data.data !== null
          ? (data.data as Record<string, unknown>)
          : undefined) ||
        (typeof data.result === 'object' && data.result !== null
          ? (data.result as Record<string, unknown>)
          : undefined);

      const manifestCid =
        (typeof data.manifest_cid === 'string' ? data.manifest_cid : undefined) ||
        (typeof data.web4_manifest_cid === 'string'
          ? data.web4_manifest_cid
          : undefined) ||
        (nested && typeof nested.manifest_cid === 'string'
          ? nested.manifest_cid
          : undefined) ||
        (nested && typeof nested.web4_manifest_cid === 'string'
          ? nested.web4_manifest_cid
          : undefined);
      const result: Web4ResolveResponse = { domain, manifest_cid: manifestCid };
      console.log('[Web4Client] resolveDomain:', {
        domain,
        manifest_cid: result.manifest_cid,
      });
      return result;
    } catch (error) {
      console.error('[Web4Client] resolveDomain failed:', error);
      return { domain, error: String(error) };
    }
  }

  /**
   * Fetch Web4 manifest by CID
   */
  async fetchManifest(manifestCid: string): Promise<Web4ManifestResponse> {
    try {
      const data = await publicQuicRequest<Web4ManifestResponse>(
        '/api/v1/web4/content/manifest',
        {
          method: 'POST',
          body: JSON.stringify({ cid: manifestCid }),
          headers: { 'content-type': 'application/json' },
        },
      );
      console.log('[Web4Client] fetchManifest:', { cid: manifestCid });
      return data;
    } catch (error) {
      console.error('[Web4Client] fetchManifest failed:', error);
      return { cid: manifestCid, error: String(error) };
    }
  }

  /**
   * Fetch Web4 blob content by CID
   */
  async fetchBlob(cid: string): Promise<{ data?: string; error?: string }> {
    try {
      const data = await publicQuicRequest<{ data: string }>(
        '/api/v1/web4/content/blob',
        {
          method: 'POST',
          body: JSON.stringify({ cid }),
          headers: { 'content-type': 'application/json' },
        },
      );
      console.log('[Web4Client] fetchBlob:', { cid });
      return data;
    } catch (error) {
      console.error('[Web4Client] fetchBlob failed:', error);
      return { error: String(error) };
    }
  }
}

export default new Web4Client();
