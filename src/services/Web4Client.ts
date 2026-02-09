/**
 * Web4 Client - Direct QUIC calls for Web4 endpoints
 * Uses public ALPN for Web4 content endpoints (read-only, no auth)
 */

import { publicQuicRequest } from './quic';

export interface Web4ResolveResponse {
  domain: string;
  manifest_cid?: string;
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
      const data = await publicQuicRequest<Web4ResolveResponse>(
        '/api/v1/web4/domains/resolve',
        {
          method: 'POST',
          body: JSON.stringify({ domain, version: null }),
          headers: { 'content-type': 'application/json' },
        },
      );
      console.log('[Web4Client] resolveDomain:', { domain, manifest_cid: data.manifest_cid });
      return data;
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
