/**
 * NetworkDirectoryService — validator directory over public QUIC.
 *
 * Endpoint: GET /api/v1/network/directory   (public, no auth)
 *
 * This call runs during app bootstrap, before `bootstrapReady` has
 * resolved. To avoid a deadlock (the regular `rawRequest` gates on
 * `bootstrapReady`), we go straight to the native bridge instead of
 * through `publicQuicRequest`.
 *
 * Response shape: the nested contract from 2026-04-24 — see
 * `src/types/networkTopology.ts` for the full typed interface. In
 * short:
 *
 *   { network_id, chain_height, timestamp,
 *     this_node: { did, role, spki_pin },
 *     topology: { validators[], gateways[],
 *                 total_validators, total_gateways,
 *                 connected_peers } }
 *
 * Callers get back a simplified `DirectoryValidator` view (host + port
 * + did + stake + status) that matches what the bootstrap path
 * actually needs. Per-validator SPKI pins are NOT carried on the wire
 * anymore — the only pin we get is `this_node.spki_pin` for whichever
 * node answered. That limits runtime validator switching to "this
 * node or keep-current"; any cross-validator swap has to wait for
 * pins to come back into the contract (or system CA trust to land).
 */

import { NativeModules } from 'react-native';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT, QUIC_CONFIG } from '../config';
import type { NetworkTopologyResponse } from '../types/networkTopology';

const { NativeQuic } = NativeModules;
const DIRECTORY_PATH = '/api/v1/network/directory';

export interface DirectoryValidator {
  did: string;
  /** "host:port" as received from the server. */
  endpoint: string;
  host: string;
  port: number;
  stake: number;
  /** Raw status string — typically "active" / "stale" / "jailed" / "slashed". */
  status: string;
  /** True when status === 'active'. Kept separate so ranking stays simple. */
  healthy: boolean;
}

/**
 * Bootstrap-friendly view of the directory. Callers use
 * `local_spki_pin` to pin the node they're already connected to; the
 * validator list is informational for ranking and for the Explorer UI.
 */
export interface DirectoryView {
  validators: DirectoryValidator[];
  /** SPKI pin of the node that answered the request (this_node). */
  local_spki_pin?: string;
  chain_height?: number;
  /** DID of the node that answered, for display. */
  local_did?: string;
}

function splitEndpoint(endpoint: unknown): { host: string; port: number } | null {
  if (typeof endpoint !== 'string') return null;
  const colon = endpoint.lastIndexOf(':');
  if (colon <= 0) return null;
  const host = endpoint.slice(0, colon).trim();
  const portStr = endpoint.slice(colon + 1).trim();
  const port = Number.parseInt(portStr, 10);
  if (!host || !Number.isFinite(port) || port <= 0 || port >= 65536) return null;
  return { host, port };
}

function toDirectoryValidator(v: unknown): DirectoryValidator | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.did !== 'string' || typeof o.endpoint !== 'string') return null;
  if (typeof o.stake !== 'number' || typeof o.status !== 'string') return null;
  const split = splitEndpoint(o.endpoint);
  if (!split) return null;
  return {
    did: o.did,
    endpoint: o.endpoint,
    host: split.host,
    port: split.port,
    stake: o.stake,
    status: o.status,
    healthy: o.status === 'active',
  };
}

class NetworkDirectoryService {
  /**
   * Fetch the directory directly via the native bridge — bypasses the
   * `bootstrapReady` gate so the bootstrap itself doesn't deadlock.
   *
   * @param target optional `{ host, port }` to dial. If omitted, falls back
   * to the hardcoded `DEFAULT_NODE_HOST:DEFAULT_NODE_PORT`.
   */
  async fetchDirectory(
    target?: { host: string; port: number },
  ): Promise<DirectoryView | null> {
    if (!NativeQuic?.request) {
      console.warn('[NetworkDirectory] native bridge unavailable');
      return null;
    }
    const host = target?.host ?? DEFAULT_NODE_HOST;
    const port = target?.port ?? DEFAULT_NODE_PORT;
    const url = `quic://${host}:${port}${DIRECTORY_PATH}`;
    try {
      const raw = await NativeQuic.request(url, {
        method: 'GET',
        headers: {},
        alpn: 'public',
        timeout: QUIC_CONFIG.defaultTimeout,
      });
      if (!raw?.ok) {
        console.warn(
          '[NetworkDirectory] fetch returned non-OK:',
          raw?.status,
          raw?.body?.substring?.(0, 200),
        );
        return null;
      }
      const parsed = JSON.parse(raw.body) as Partial<NetworkTopologyResponse>;
      const topology = parsed?.topology;
      if (!parsed || !topology || !Array.isArray(topology.validators)) {
        console.warn(
          '[NetworkDirectory] response missing topology.validators — old-format server?',
        );
        return null;
      }
      const validators = topology.validators
        .map(toDirectoryValidator)
        .filter((v): v is DirectoryValidator => v !== null);
      const view: DirectoryView = {
        validators,
        local_spki_pin:
          typeof parsed.this_node?.spki_pin === 'string'
            ? parsed.this_node.spki_pin
            : undefined,
        local_did:
          typeof parsed.this_node?.did === 'string'
            ? parsed.this_node.did
            : undefined,
        chain_height:
          typeof parsed.chain_height === 'number' ? parsed.chain_height : undefined,
      };
      console.log(
        `[NetworkDirectory] got ${view.validators.length} validator(s), ` +
          `chain_height=${view.chain_height ?? 'n/a'} ` +
          `this_node_pin=${view.local_spki_pin ? 'present' : 'missing'}`,
      );
      return view;
    } catch (err) {
      // Expected on every cold start until the directory endpoint is
      // reachable — the public ALPN path falls back to system CA, which
      // doesn't trust dev / self-signed validator certs ("UnknownIssuer"),
      // and the caller already handles `null` by falling back to the
      // hardcoded default validator. Logged at info level so it doesn't
      // surface as a scary red warning on launch.
      console.log('[NetworkDirectory] fetch failed (using default):', err);
      return null;
    }
  }

  /**
   * Rank validators for selection. Healthy first, then higher stake.
   * Per-validator SPKI pins aren't in the current contract, so the
   * pin-presence filter from earlier rounds is gone — every parseable
   * validator is returned, and the caller's switching policy decides
   * whether it can safely dial them.
   */
  rankValidators(validators: DirectoryValidator[]): DirectoryValidator[] {
    return [...validators]
      .filter(v => v.endpoint.includes(':'))
      .sort((a, b) => {
        if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
        if (b.stake !== a.stake) return b.stake - a.stake;
        return a.endpoint.localeCompare(b.endpoint);
      });
  }
}

const networkDirectoryService = new NetworkDirectoryService();
export default networkDirectoryService;
export { NetworkDirectoryService };
