/**
 * Web4 Client - Direct QUIC calls for Web4 endpoints
 * Matches iOS implementation: uses public ALPN for Web4 content endpoints
 */

import QuicClient from './QuicClient';

export interface Web4ResolveResponse {
  domain: string;
  manifest_cid?: string;
  error?: string;
}

export interface Web4ManifestResponse {
  cid: string;
  files?: Record<string, any>;
  error?: string;
}

class Web4Client {
  private baseUrl: string;

  constructor(baseUrl: string = 'quic://77.42.37.161:9334') {
    this.baseUrl = baseUrl;
  }

  /**
   * Resolve a Web4 domain to get manifest CID
   * Uses PUBLIC ALPN (unauthenticated)
   */
  async resolveDomain(domain: string): Promise<Web4ResolveResponse> {
    const url = `${this.baseUrl}/api/v1/web4/domains/resolve`;
    const body = JSON.stringify({ domain, version: null });

    try {
      const response = await QuicClient.request(url, {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
        },
        alpn: 'public', // ← CRITICAL: Use public ALPN like iOS
        timeout: 30,
      });

      if (!response.ok) {
        const errorMsg = response.body || `HTTP ${response.status}`;
        console.error('[Web4Client] resolveDomain ERROR:', errorMsg);
        return { domain, error: errorMsg };
      }

      const decoded = JSON.parse(response.body);
      console.log('[Web4Client] resolveDomain SUCCESS:', { domain, manifest_cid: decoded.manifest_cid });
      return decoded;
    } catch (error) {
      console.error('[Web4Client] resolveDomain EXCEPTION:', error);
      return { domain, error: String(error) };
    }
  }

  /**
   * Fetch Web4 manifest by CID
   * Uses PUBLIC ALPN (unauthenticated)
   */
  async fetchManifest(manifestCid: string): Promise<Web4ManifestResponse> {
    const url = `${this.baseUrl}/api/v1/web4/content/manifest`;
    const body = JSON.stringify({ cid: manifestCid });

    try {
      const response = await QuicClient.request(url, {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
        },
        alpn: 'public', // ← CRITICAL: Use public ALPN like iOS
        timeout: 30,
      });

      if (!response.ok) {
        const errorMsg = response.body || `HTTP ${response.status}`;
        console.error('[Web4Client] fetchManifest ERROR:', errorMsg);
        return { cid: manifestCid, error: errorMsg };
      }

      const decoded = JSON.parse(response.body);
      console.log('[Web4Client] fetchManifest SUCCESS:', { cid: manifestCid });
      return decoded;
    } catch (error) {
      console.error('[Web4Client] fetchManifest EXCEPTION:', error);
      return { cid: manifestCid, error: String(error) };
    }
  }

  /**
   * Fetch Web4 blob content by CID
   * Uses PUBLIC ALPN (unauthenticated)
   */
  async fetchBlob(cid: string): Promise<{ data?: string; error?: string }> {
    const url = `${this.baseUrl}/api/v1/web4/content/blob`;
    const body = JSON.stringify({ cid });

    try {
      const response = await QuicClient.request(url, {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
        },
        alpn: 'public', // ← CRITICAL: Use public ALPN like iOS
        timeout: 30,
      });

      if (!response.ok) {
        const errorMsg = response.body || `HTTP ${response.status}`;
        console.error('[Web4Client] fetchBlob ERROR:', errorMsg);
        return { error: errorMsg };
      }

      console.log('[Web4Client] fetchBlob SUCCESS:', { cid });
      return { data: response.body };
    } catch (error) {
      console.error('[Web4Client] fetchBlob EXCEPTION:', error);
      return { error: String(error) };
    }
  }
}

export default new Web4Client();
